<?php

namespace Tests\Feature;

use App\Models\DbEntry;
use App\Models\EhdmReceipt;
use App\Models\User;
use App\Services\Ehdm\EhdmClient;
use App\Services\Ehdm\EhdmMath;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EhdmTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $mode = 'mock', bool $canSales = true): User
    {
        $entry = DbEntry::create([
            'name' => 'Test 1C',
            'username' => 'terminal',
            'password' => 'secret',
            'api_get_purchase' => 'http://1c.test/purchases',
            'api_get_orders' => 'http://1c.test/orders',
            'api_post_orders' => 'http://1c.test/orders',
            'api_post_purchases' => 'http://1c.test/purchases',
            'einvoice_tin' => '01234567',
            'ehdm_mode' => $mode,
            'ehdm_crn' => '52014201',
            'ehdm_cert' => $mode === 'mock' ? null : "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----",
        ]);

        return User::create([
            'name' => 'Cashier',
            'email' => 'cashier@example.test',
            'password' => 'password',
            'db_entry_id' => $entry->id,
            'can_sales' => $canSales,
            'ehdm_cashier_id' => 3,
        ]);
    }

    private function headers(User $user): array
    {
        config(['app.jwt_secret' => 'test-secret']);

        return ['Authorization' => 'Bearer '.JWT::encode(['sub' => $user->id, 'type' => 'access', 'exp' => time() + 600], 'test-secret', 'HS256')];
    }

    private function sale(array $overrides = []): array
    {
        return $overrides + [
            'items' => [
                ['goodName' => 'Օճառ', 'goodCode' => 'S-1', 'adgCode' => '3401', 'unit' => 'հատ', 'quantity' => 2, 'price' => 250],
                ['goodName' => 'Բրինձ', 'adgCode' => '1006', 'unit' => 'կգ', 'quantity' => 0.101, 'price' => 1000],
            ],
        ];
    }

    public function test_sums_follow_the_tax_service_rules(): void
    {
        $this->assertSame(500.0, EhdmMath::lineTotal(['price' => 250, 'quantity' => 2]));
        $this->assertSame(101.0, EhdmMath::lineTotal(['price' => 1000, 'quantity' => 0.101]));
        // The manual's example: 2 × 25000, 10% off, then 1000 off = 44000.
        $this->assertSame(44000.0, EhdmMath::lineTotal([
            'price' => 25000, 'quantity' => 2, 'discount' => 10, 'discountType' => 1,
            'additionalDiscount' => 1000, 'additionalDiscountType' => 16,
        ]));
        $this->assertSame(0.01, EhdmMath::money(0.005));
        $this->assertSame(0.0, EhdmMath::money(0.004));
    }

    public function test_a_cash_sale_is_printed_in_mock_mode(): void
    {
        $user = $this->user();

        $response = $this->postJson('/api/sales/ehdm/receipts', $this->sale(['partnerTin' => '07654321']), $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('status', 'OK')
            ->assertJsonPath('mode', 'mock')
            ->assertJsonPath('total', 601)
            ->assertJsonPath('cash', 601)
            ->assertJsonPath('receiptId', '1')
            ->assertJsonPath('crn', '52014201');

        $this->assertMatchesRegularExpression('/^TIN: 01234567, CRN: 52014201, SERIAL: MOCK\w+, Receipt_ID: 1, .*TOTAL_CASH: 601, TOTAL_NONCASH: 0, .*TOTAL: 601$/', $response->json('qr'));
        $this->assertNotEmpty($response->json('fiscal'));
        $this->assertSame('S-1', $response->json('items.0.goodCode'));
        // Without a product code, the ԱՏԳ code is sent.
        $this->assertSame('1006', $response->json('items.1.goodCode'));

        $this->getJson('/api/sales/ehdm', $this->headers($user))
            ->assertOk()
            ->assertJsonPath('mode', 'mock')
            ->assertJsonPath('ready', true)
            ->assertJsonCount(1, 'receipts');
    }

    public function test_an_underpaid_receipt_is_refused_and_kept_as_failed(): void
    {
        $user = $this->user();

        $this->postJson('/api/sales/ehdm/receipts', $this->sale(['cashAmount' => 100, 'cardAmount' => 0]), $this->headers($user))
            ->assertStatus(422)
            ->assertJsonPath('code', 152);

        $this->assertSame(EhdmReceipt::STATUS_FAILED, EhdmReceipt::first()->status);
        $this->assertStringContainsString('PAID_AMOUNT_LESS_THAN_TOTAL', EhdmReceipt::first()->error);
    }

    public function test_card_cannot_exceed_the_total_and_cash_gives_change(): void
    {
        $user = $this->user();

        $this->postJson('/api/sales/ehdm/receipts', $this->sale(['cardAmount' => 700]), $this->headers($user))
            ->assertStatus(422)
            ->assertJsonPath('code', 167);

        $this->postJson('/api/sales/ehdm/receipts', $this->sale(['cashAmount' => 1000]), $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('change', 399);
    }

    public function test_part_of_a_receipt_is_returned_then_the_rest(): void
    {
        $user = $this->user();
        $sale = $this->postJson('/api/sales/ehdm/receipts', $this->sale(), $this->headers($user))->assertCreated();
        $id = $sale->json('id');

        $info = $this->getJson("/api/sales/ehdm/receipts/{$id}/return-info", $this->headers($user))
            ->assertOk()
            ->assertJsonPath('items.0.receiptProductId', 0)
            ->assertJsonPath('items.0.quantity', 2);

        // A wrong amount is refused.
        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 300,
            'items' => [['receiptProductId' => 0, 'quantity' => 1]],
        ], $this->headers($user))->assertStatus(422)->assertJsonPath('code', 178);

        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 250,
            'items' => [['receiptProductId' => 0, 'quantity' => 1, 'goodName' => 'Օճառ']],
        ], $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('type', 'RETURN')
            ->assertJsonPath('total', 250)
            ->assertJsonPath('returnOfReceiptId', '1');

        $this->getJson("/api/sales/ehdm/receipts/{$id}/return-info", $this->headers($user))
            ->assertJsonPath('items.0.quantity', 1);

        // More than is left is refused.
        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 500,
            'items' => [['receiptProductId' => 0, 'quantity' => 2]],
        ], $this->headers($user))->assertStatus(422)->assertJsonPath('code', 181);

        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 351,
            'items' => [['receiptProductId' => 0, 'quantity' => 1], ['receiptProductId' => 1, 'quantity' => 0.101]],
        ], $this->headers($user))->assertCreated();

        $list = collect($this->getJson('/api/sales/ehdm', $this->headers($user))->json('receipts'));
        $this->assertEquals(601, $list->firstWhere('id', $id)['returnedTotal']);
        // The refused returns are kept as failed.
        $this->assertSame(2, $list->where('status', 'FAILED')->count());

        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 1,
            'items' => [['receiptProductId' => 0, 'quantity' => 1]],
        ], $this->headers($user))->assertStatus(422)->assertJsonPath('code', 158);
    }

    public function test_a_copy_comes_from_the_register(): void
    {
        $user = $this->user();
        $id = $this->postJson('/api/sales/ehdm/receipts', $this->sale(), $this->headers($user))->json('id');

        $this->postJson("/api/sales/ehdm/receipts/{$id}/copy", [], $this->headers($user))
            ->assertOk()
            ->assertJsonPath('copy', true)
            ->assertJsonPath('receiptId', '1');
    }

    public function test_the_request_number_grows_and_a_rejected_one_is_skipped(): void
    {
        $user = $this->user('live');
        $seqs = [];
        Http::fake(function (Request $request) use (&$seqs) {
            $seqs[] = $request['seq'];
            if (count($seqs) === 1) {
                return Http::response(['code' => 104, 'message' => 'INVALID_SEQ', 'errorMessage' => 'Սխալ արժեք seq դաշտի համար. 1']);
            }

            return Http::response(['code' => 0, 'message' => 'OK', 'result' => [
                'receiptId' => '8', 'crn' => '52014201', 'sn' => '2FECD1F8', 'tin' => '01234567', 'taxpayer' => '«Թեստ»',
                'address' => 'Երևան', 'time' => 1721140445000, 'fiscal' => '52517829', 'total' => 601.0, 'change' => 0.0, 'qr' => 'TIN: 01234567',
            ]]);
        });

        $this->postJson('/api/sales/ehdm/receipts', $this->sale(), $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('fiscal', '52517829')
            ->assertJsonPath('taxpayer', '«Թեստ»');

        $this->assertSame([1, 2], $seqs);
        $this->assertSame(2, $user->dbEntry->fresh()->ehdm_seq);
        Http::assertSent(fn (Request $r) => $r->url() === 'https://ecrm.taxservice.am/taxsystem-rs-vcr/api/v1.0/print'
            && $r['crn'] === '52014201' && $r['cashierId'] === 3 && $r['mode'] === 2 && $r['items'][0]['dep'] === 1
            && $r->hasHeader('language', 'hy'));
    }

    public function test_an_unreachable_register_is_a_clear_error(): void
    {
        $user = $this->user('test');
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('timeout'));

        $this->postJson('/api/sales/ehdm/receipts', $this->sale(), $this->headers($user))
            ->assertStatus(502)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'not reachable'));
    }

    public function test_access_needs_sales_and_a_configured_register(): void
    {
        $this->getJson('/api/sales/ehdm', $this->headers($this->user('mock', false)))->assertForbidden();

        User::query()->delete();
        DbEntry::query()->delete();
        $this->postJson('/api/sales/ehdm/receipts', $this->sale(), $this->headers($this->user('off')))
            ->assertStatus(400);
    }

    public function test_receipts_of_another_company_are_hidden(): void
    {
        $user = $this->user();
        $id = $this->postJson('/api/sales/ehdm/receipts', $this->sale(), $this->headers($user))->json('id');
        EhdmReceipt::whereKey($id)->update(['db_entry_id' => null]);

        $this->getJson("/api/sales/ehdm/receipts/{$id}", $this->headers($user))->assertNotFound();
    }

    private function codes(int $count, string $prefix = 'A'): array
    {
        return array_map(fn (int $i) => "0104859996301235{$prefix}21x".str_pad((string) $i, 12, '0', STR_PAD_LEFT)."\u{1d}93YnNN", range(1, $count));
    }

    public function test_emark_codes_go_with_the_receipt_and_come_back_with_a_return(): void
    {
        $user = $this->user();
        [$a, $b, $c] = $this->codes(3);
        $sale = [
            'items' => [
                ['goodName' => 'Սիգարետ', 'adgCode' => '2402', 'unit' => 'տուփ', 'quantity' => 3, 'price' => 1000, 'emarks' => [$a, $b, $c]],
                ['goodName' => 'Լուցկի', 'adgCode' => '3605', 'unit' => 'հատ', 'quantity' => 1, 'price' => 50],
            ],
        ];

        $id = $this->postJson('/api/sales/ehdm/receipts', $sale, $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('items.0.emarks', [$a, $b, $c])
            ->json('id');

        // The same codes cannot be sold twice.
        $this->postJson('/api/sales/ehdm/receipts', $sale, $this->headers($user))
            ->assertStatus(422)
            ->assertJsonPath('code', 207);

        $this->getJson("/api/sales/ehdm/receipts/{$id}/return-info", $this->headers($user))
            ->assertJsonPath('items.0.emarks', [$a, $b, $c])
            ->assertJsonPath('items.1.emarks', []);

        // A coded row is returned by naming its codes.
        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 1000,
            'items' => [['receiptProductId' => 0, 'quantity' => 1]],
        ], $this->headers($user))->assertStatus(422);

        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 1000,
            'items' => [['receiptProductId' => 0, 'quantity' => 1, 'emarks' => [$b]]],
        ], $this->headers($user))
            ->assertCreated()
            ->assertJsonPath('items.0.emarks', [$b]);

        $this->getJson("/api/sales/ehdm/receipts/{$id}/return-info", $this->headers($user))
            ->assertJsonPath('items.0.emarks', [$a, $c])
            ->assertJsonPath('items.0.quantity', 2);

        // A code already given back cannot be returned again.
        $this->postJson("/api/sales/ehdm/receipts/{$id}/return", [
            'cashAmount' => 1000,
            'items' => [['receiptProductId' => 0, 'quantity' => 1, 'emarks' => [$b]]],
        ], $this->headers($user))->assertStatus(422);
    }

    public function test_emark_codes_must_match_the_quantity_and_the_length(): void
    {
        $user = $this->user();
        $row = ['goodName' => 'Գինի', 'adgCode' => '2204', 'unit' => 'շիշ', 'price' => 5000];

        $this->postJson('/api/sales/ehdm/receipts', ['items' => [$row + ['quantity' => 2, 'emarks' => $this->codes(1)]]], $this->headers($user))
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'eMark'));

        $this->postJson('/api/sales/ehdm/receipts', ['items' => [$row + ['quantity' => 1, 'emarks' => ['too-short-code']]]], $this->headers($user))
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.emarks.0');

        [$code] = $this->codes(1);
        $this->postJson('/api/sales/ehdm/receipts', ['items' => [$row + ['quantity' => 1, 'emarks' => [$code]], $row + ['quantity' => 1, 'emarks' => [$code]]]], $this->headers($user))
            ->assertStatus(422)
            ->assertJsonValidationErrors('items.0.emarks.0');
    }

    public function test_emark_codes_are_sent_once_for_the_whole_receipt(): void
    {
        $user = $this->user('live');
        Http::fake(['*' => Http::response(['code' => 0, 'message' => 'OK', 'result' => ['receiptId' => '1', 'total' => 3000.0, 'time' => 1721140445000]])]);
        $codes = $this->codes(3);

        $this->postJson('/api/sales/ehdm/receipts', ['items' => [
            ['goodName' => 'Սիգարետ', 'adgCode' => '2402', 'unit' => 'տուփ', 'quantity' => 2, 'price' => 1000, 'emarks' => [$codes[0], $codes[1]]],
            ['goodName' => 'Սիգար', 'adgCode' => '2402', 'unit' => 'հատ', 'quantity' => 1, 'price' => 1000, 'emarks' => [$codes[2]]],
        ]], $this->headers($user))->assertCreated();

        Http::assertSent(fn (Request $r) => $r['emarks'] === $codes && ! isset($r['items'][0]['emarks']));
    }

    public function test_setup_calls_work_in_mock_mode(): void
    {
        $client = EhdmClient::for($this->user()->dbEntry);

        $this->assertStringContainsString('հաջողությամբ', $client->checkConnection());
        $this->assertStringContainsString('հաջողությամբ', $client->activate());
        $this->assertStringContainsString('հաջողությամբ', $client->configureDepartments([1 => 1]));
    }
}
