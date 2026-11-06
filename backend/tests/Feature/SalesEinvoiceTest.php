<?php

namespace Tests\Feature;

use App\Models\DbEntry;
use App\Models\EinvoiceDocument;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SalesEinvoiceTest extends TestCase
{
    use RefreshDatabase;

    private function user(bool $canSales = true, bool $account = true): User
    {
        $entry = DbEntry::create([
            'name' => 'Test 1C',
            'username' => 'terminal',
            'password' => 'secret',
            'api_get_purchase' => 'http://1c.test/purchases',
            'api_get_orders' => 'http://1c.test/orders',
            'api_post_orders' => 'http://1c.test/orders',
            'api_post_purchases' => 'http://1c.test/purchases',
            'einvoice_tin' => $account ? '01234567' : null,
            'einvoice_login' => $account ? 'flexit' : null,
            'einvoice_password' => $account ? 'tax-pass' : null,
        ]);

        return User::create([
            'name' => 'Seller',
            'email' => 'seller@example.test',
            'password' => 'password',
            'db_entry_id' => $entry->id,
            'can_sales' => $canSales,
        ]);
    }

    private function headers(User $user): array
    {
        config(['app.jwt_secret' => 'test-secret']);

        return ['Authorization' => 'Bearer '.JWT::encode(['sub' => $user->id, 'type' => 'access', 'exp' => time() + 600], 'test-secret', 'HS256')];
    }

    private function fakeTaxService(bool $draftOk = true): void
    {
        Http::fake([
            'ews.taxservice.am/*' => Http::response('<S:Envelope><S:Body><LoginWebResponse><AuthToken>tok-123</AuthToken></LoginWebResponse></S:Body></S:Envelope>'),
            'e-invoicing.taxservice.am/api/tpinfo/*' => Http::response(['ok' => true, 'payload' => ['name' => 'Գնորդ ՍՊԸ', 'address' => 'Երևան']]),
            'e-invoicing.taxservice.am/api/dictionaries/classifier-list' => Http::response(['ok' => true, 'payload' => [['id' => 'cls-77', 'code' => '3401110001', 'name' => 'Օճառ']]]),
            'e-invoicing.taxservice.am/api/acc-doc-*' => Http::response($draftOk
                ? ['ok' => true, 'payload' => ['id' => 'x']]
                : ['ok' => false, 'failure' => ['code' => 'E1', 'message' => 'buyerName is required']]),
        ]);
    }

    private function goodsDoc(): array
    {
        return [
            'type' => 'ACC_DOC_GOODS',
            'buyerTin' => '07654321',
            'buyerName' => 'Գնորդ ՍՊԸ',
            'deliveredAt' => '2026-11-07',
            'items' => [
                ['name' => 'Օճառ', 'classifierCode' => '3401110001', 'unit' => 'հատ', 'quantity' => 3, 'unitPrice' => 250],
            ],
        ];
    }

    public function test_password_is_encrypted_and_never_returned(): void
    {
        $user = $this->user();
        $entry = $user->dbEntry;

        $this->assertNotSame('tax-pass', DB::table('db_entries')->value('einvoice_password'));
        $this->assertSame('tax-pass', $entry->fresh()->einvoice_password);
        $this->assertArrayNotHasKey('einvoice_password', $entry->toArray());
    }

    public function test_needs_the_sales_section_and_an_account(): void
    {
        $this->getJson('/api/sales/documents', $this->headers($this->user(canSales: false)))->assertForbidden();

        DB::table('users')->delete();
        DB::table('db_entries')->delete();
        $this->postJson('/api/sales/documents', $this->goodsDoc(), $this->headers($this->user(account: false)))
            ->assertStatus(400);
    }

    public function test_creates_a_goods_draft_with_the_classifier_id(): void
    {
        $this->fakeTaxService();
        $user = $this->user();

        $this->postJson('/api/sales/documents', $this->goodsDoc(), $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('status', 'DRAFT');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'loginService')
            && str_contains($r->body(), 'Tin="01234567"') && str_contains($r->body(), 'Password="tax-pass"'));
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'acc-doc-goods-create-draft')
            && $r->header('Cookie')[0] === 'jwt-auth-token=tok-123'
            && $r['payload']['buyerTin'] === '07654321'
            && $r['payload']['items'][0]['classifierId'] === 'cls-77'
            && (float) $r['payload']['items'][0]['totalValue'] === 750.0
            && (float) $r['payload']['totalValue'] === 750.0);

        $doc = EinvoiceDocument::first();
        $this->assertSame('DRAFT', $doc->status);
        $this->assertSame('750.00', (string) $doc->total);
    }

    public function test_services_need_no_classifier_code(): void
    {
        $this->fakeTaxService();
        $doc = $this->goodsDoc();
        $doc['type'] = 'ACC_DOC_SERVICES';
        $doc['items'] = [['name' => 'Տեղադրում', 'unit' => 'ծառ.', 'quantity' => 1, 'unitPrice' => 50000]];

        $this->postJson('/api/sales/documents', $doc, $this->headers($this->user()))->assertCreated();

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'acc-doc-services-create-draft')
            && ! isset($r['payload']['items'][0]['classifierId']));
    }

    public function test_keeps_the_tax_service_error(): void
    {
        $this->fakeTaxService(draftOk: false);

        $this->postJson('/api/sales/documents', $this->goodsDoc(), $this->headers($this->user()))
            ->assertStatus(502)
            ->assertJsonPath('error', 'buyerName is required');

        $this->assertSame('FAILED', EinvoiceDocument::first()->status);
    }

    private function signer(): User
    {
        $user = $this->user();
        $user->update(['cosign_username' => 'director', 'cosign_password' => 'sign-pass']);

        return $user;
    }

    private function fakeSigning(string $finalState = 'SIGNED'): void
    {
        \App\Services\Einvoice\EinvoiceClient::$pollDelayMs = 0;
        Http::fake([
            'ews.taxservice.am/*' => Http::response('<AuthToken>tok-123</AuthToken>'),
            'e-invoicing.taxservice.am/api/tpinfo/*' => Http::response(['ok' => true, 'payload' => ['name' => 'Մենք ՍՊԸ']]),
            'e-invoicing.taxservice.am/api/acc-doc-*' => Http::response(['ok' => true, 'payload' => null]),
            'e-invoicing.taxservice.am/api/dispatcher/request-issue' => Http::response(['ok' => true]),
            'e-invoicing.taxservice.am/api/dispatcher/issue-*' => Http::response(['ok' => true]),
            // start: preparing -> ready; then checks: still on the phone -> final
            'e-invoicing.taxservice.am/api/dispatcher/sign-task-by-id' => Http::sequence()
                ->push(['ok' => true, 'payload' => ['state' => 'HASH_CALCULATING']])
                ->push(['ok' => true, 'payload' => ['state' => 'SIGN_WAITING']])
                ->push(['ok' => true, 'payload' => ['state' => 'SIGN_WAITING']])
                ->push(['ok' => true, 'payload' => ['state' => $finalState, 'signedAt' => '2026-11-07T10:00:00Z', 'failMessage' => 'Wrong CoSign password']]),
            'e-invoicing.taxservice.am/api/dispatcher/sign-task-item-by-invoice-id' => Http::response(['ok' => true, 'payload' => [['signTaskId' => 'x', 'status' => 'OK', 'serialNo' => 'ԱԱ12345678']]]),
        ]);
    }

    private function servicesDoc(): array
    {
        return [
            'type' => 'ACC_DOC_SERVICES',
            'buyerTin' => '07654321',
            'deliveredAt' => '2026-11-07',
            'items' => [['name' => 'Սպասարկում', 'unit' => 'ամիս', 'quantity' => 1, 'unitPrice' => 1000]],
        ];
    }

    public function test_create_and_sign_with_cosign_then_status_gives_the_serial_number(): void
    {
        $this->fakeSigning();
        $user = $this->signer();

        $id = $this->postJson('/api/sales/documents', $this->servicesDoc() + ['sign' => true], $this->headers($user))
            ->assertStatus(202)
            ->assertJsonPath('status', 'SIGNING')
            ->assertJsonPath('signMethod', 'cosign')
            ->json('id');

        // First check: still signing; second: issued.
        $this->getJson("/api/sales/documents/{$id}/sign-status", $this->headers($user))->assertJsonPath('status', 'SIGNING');
        $this->getJson("/api/sales/documents/{$id}/sign-status", $this->headers($user))
            ->assertJsonPath('status', 'ISSUED')
            ->assertJsonPath('serialNo', 'ԱԱ12345678');

        $draftId = EinvoiceDocument::first()->src_id;
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'request-issue') && $r['payload']['ids'] === $draftId);
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'issue-co-sign')
            && $r['payload']['username'] === 'director' && $r['payload']['password'] === 'sign-pass');
        $this->assertNotSame('sign-pass', DB::table('users')->value('cosign_password'));
    }

    public function test_mobile_id_and_nikita_send_only_the_phone(): void
    {
        $this->fakeSigning();
        $user = $this->user();
        $user->update(['mobile_id_phone' => '+374 91 12-34-56']);

        $this->postJson('/api/sales/documents', $this->servicesDoc() + ['sign' => true], $this->headers($user))
            ->assertStatus(202)
            ->assertJsonPath('signMethod', 'mobile_id');
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'issue-mts') && $r['payload']['phone'] === '37491123456');

        $this->assertSame('nikita', (new User(['nikita_phone' => '091123456']))->signMethod());
        $this->assertSame('37491123456', \App\Services\Einvoice\EinvoiceClient::phone('091123456'));
    }

    public function test_a_failed_signature_goes_back_to_draft(): void
    {
        $this->fakeSigning('SIGN_FAILED');
        $user = $this->signer();

        $id = $this->postJson('/api/sales/documents', $this->servicesDoc() + ['sign' => true], $this->headers($user))
            ->assertStatus(202)
            ->json('id');

        $this->getJson("/api/sales/documents/{$id}/sign-status", $this->headers($user));
        $this->getJson("/api/sales/documents/{$id}/sign-status", $this->headers($user))
            ->assertJsonPath('status', 'DRAFT')
            ->assertJsonPath('error', 'Signing failed: Wrong CoSign password');
    }

    public function test_signing_needs_a_cosign_account_and_a_draft_of_the_same_company(): void
    {
        $this->fakeSigning();
        $user = $this->user();
        $doc = EinvoiceDocument::create([
            'user_id' => $user->id, 'db_entry_id' => $user->db_entry_id, 'type' => 'ACC_DOC_SERVICES',
            'status' => 'DRAFT', 'src_id' => 'b72f7739-a0fc-44d4-87bf-5967a7c7dbf6', 'items' => [],
        ]);

        $this->postJson("/api/sales/documents/{$doc->id}/sign", [], $this->headers($user))->assertStatus(400);
        $this->getJson('/api/sales/documents', $this->headers($user))->assertJsonPath('canSign', false);

        $doc->update(['db_entry_id' => null]);
        $user->update(['cosign_username' => 'director', 'cosign_password' => 'sign-pass']);
        $this->postJson("/api/sales/documents/{$doc->id}/sign", [], $this->headers($user))->assertNotFound();
    }

    public function test_an_unreachable_login_service_gives_a_clear_error(): void
    {
        Http::fake(['ews.taxservice.am/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('timed out')]);

        $this->getJson('/api/sales/taxpayer?tin=07654321', $this->headers($this->user()))
            ->assertStatus(502)
            ->assertJsonPath('message', 'The tax service login (ews.taxservice.am) is not reachable from this server');
    }

    public function test_unknown_classifier_code_is_explained(): void
    {
        $this->fakeTaxService();
        $doc = $this->goodsDoc();
        $doc['items'][0]['classifierCode'] = '9999999999';

        $this->postJson('/api/sales/documents', $doc, $this->headers($this->user()))
            ->assertStatus(502)
            ->assertJsonPath('error', 'ԱՏԳ ԱԱ code 9999999999 is not in the tax service classifier (row 1)');
    }
}
