<?php

namespace Tests\Feature;

use App\Models\SupportCustomer;
use App\Models\SupportResponse;
use App\Models\SupportTicket;
use App\Services\Support\FluentImport;
use App\Support\WordPressPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupportPortalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.support_telegram.token' => 'BOT',
            'services.support_telegram.chat_id' => '-100555',
            'mail.default' => 'array',
        ]);
        Storage::fake('local');
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 77]])]);
    }

    private function signUp(string $email = 'ani@example.test'): string
    {
        return $this->postJson('/api/support/portal/register', [
            'firstName' => 'Անի', 'lastName' => 'Պետրոսյան', 'email' => $email,
            'phone' => '+374 91 123456', 'company' => 'Ռուբեն ՍՊԸ', 'password' => 'secret-123',
        ])->assertCreated()->json('token');
    }

    private function as(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token, 'Accept' => 'application/json'];
    }

    private function sentMail(): array
    {
        return app('mailer')->getSymfonyTransport()->messages()->all();
    }

    public function test_sign_up_sign_in_and_out(): void
    {
        $token = $this->signUp();
        $this->getJson('/api/support/portal/me', $this->as($token))->assertOk()->assertJsonPath('company', 'Ռուբեն ՍՊԸ');

        $this->postJson('/api/support/portal/register', ['firstName' => 'X', 'email' => 'ANI@example.test', 'password' => 'secret-123'])->assertStatus(422);
        $this->postJson('/api/support/portal/login', ['email' => 'ani@example.test', 'password' => 'wrong-pass'])->assertStatus(422);
        $token2 = $this->postJson('/api/support/portal/login', ['email' => ' Ani@Example.test ', 'password' => 'secret-123'])->assertOk()->json('token');

        $this->postJson('/api/support/portal/logout', [], $this->as($token2))->assertOk();
        $this->getJson('/api/support/portal/me', $this->as($token2))->assertUnauthorized();
        $this->getJson('/api/support/portal/me', $this->as($token))->assertOk();
        $this->getJson('/api/support/portal/tickets')->assertUnauthorized();
    }

    public function test_wordpress_passwords_still_work_and_are_replaced_on_first_sign_in(): void
    {
        // phpass test vector (WordPress before 6.8) and a WordPress 6.8 "$wp" bcrypt hash.
        $this->assertTrue(WordPressPassword::check('test12345', '$P$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0'));
        $this->assertFalse(WordPressPassword::check('test1234', '$P$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0'));
        $wp = '$wp'.password_hash(base64_encode(hash_hmac('sha384', 'Gyumri-2026', 'wp-sha384', true)), PASSWORD_BCRYPT);
        $this->assertTrue(WordPressPassword::check('Gyumri-2026', $wp));

        $customer = SupportCustomer::create(['first_name' => 'Հին', 'email' => 'old@example.test', 'legacy_password' => $wp]);
        $this->postJson('/api/support/portal/login', ['email' => 'old@example.test', 'password' => 'nope-nope'])->assertStatus(422);
        $this->postJson('/api/support/portal/login', ['email' => 'old@example.test', 'password' => 'Gyumri-2026'])->assertOk();

        $customer->refresh();
        $this->assertNull($customer->legacy_password);
        $this->postJson('/api/support/portal/login', ['email' => 'old@example.test', 'password' => 'Gyumri-2026'])->assertOk();
    }

    public function test_tickets_conversation_and_closing(): void
    {
        $token = $this->signUp();
        $ticket = $this->post('/api/support/portal/tickets', [
            'title' => 'Հաշվետվությունը չի բացվում', 'product' => '1C:Հաշվապահություն', 'priority' => 'critical',
            'description' => 'ՀԴՄ հաշվետվությունը սխալ է տալիս', 'files' => [UploadedFile::fake()->image('a.png')],
        ], $this->as($token))->assertCreated();

        $id = $ticket->json('id');
        $this->assertSame('Ռուբեն ՍՊԸ', SupportTicket::find($id)->company);
        $this->assertTrue(SupportTicket::find($id)->urgent);
        $this->assertStringContainsString('/api/support/portal/files/ticket/'.$id.'/0', $ticket->json('files.0.url'));
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sendMessage') && str_contains($r['text'], 'Հաշվետվությունը չի բացվում'));

        // The signed picture link works; without the signature it does not.
        $this->get($ticket->json('files.0.url'))->assertOk();
        $this->get('/api/support/portal/files/ticket/'.$id.'/0')->assertForbidden();

        $this->postJson("/api/support/portal/tickets/$id/responses", ['body' => 'Ահա ևս մի մանրամաս'], $this->as($token))
            ->assertCreated()->assertJsonPath('responses.0.author', 'customer');
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sendMessage') && str_contains($r['text'], 'նոր պատասխան'));

        $this->postJson("/api/support/portal/tickets/$id/close", [], $this->as($token))->assertOk()->assertJsonPath('status', 'solved');
        // Writing again opens it for the team.
        $this->postJson("/api/support/portal/tickets/$id/responses", ['body' => 'Կրկնվում է'], $this->as($token))->assertJsonPath('status', 'new');

        $this->getJson('/api/support/portal/tickets', $this->as($token))->assertJsonCount(1, 'tickets');
    }

    public function test_excel_files_keep_their_name_and_go_to_telegram_as_documents(): void
    {
        $token = $this->signUp();
        $ticket = $this->post('/api/support/portal/tickets', [
            'title' => 'Մնացորդներ', 'product' => '1C:Առևտրի կառավարում', 'priority' => 'normal', 'description' => 'Կցում եմ աղյուսակը',
            'files' => [UploadedFile::fake()->create('Հաշվետվություն 2026.xlsx', 100, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
        ], $this->as($token))->assertCreated();

        $this->assertSame('Հաշվետվություն_2026.xlsx', $ticket->json('files.0.name'));
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sendDocument'));
        $this->get($ticket->json('files.0.url'))->assertOk()->assertDownload();

        $this->post('/api/support/portal/tickets', [
            'title' => 'Ծրագիր', 'product' => '1C:Մանրածախ', 'priority' => 'normal', 'description' => 'Ահա ֆայլը',
            'files' => [UploadedFile::fake()->create('tool.exe', 10, 'application/x-msdownload')],
        ], $this->as($token))->assertStatus(422);
    }

    public function test_customers_see_only_their_own_tickets(): void
    {
        $ani = $this->signUp('ani@example.test');
        $id = $this->postJson('/api/support/portal/tickets', [
            'title' => 'Թեմա', 'product' => '1C:Մանրածախ', 'priority' => 'normal', 'description' => 'Նկարագրություն այստեղ',
        ], $this->as($ani))->json('id');

        $other = $this->signUp('other@example.test');
        $this->getJson('/api/support/portal/tickets', $this->as($other))->assertJsonCount(0, 'tickets');
        $this->getJson("/api/support/portal/tickets/$id", $this->as($other))->assertNotFound();
        $this->postJson("/api/support/portal/tickets/$id/responses", ['body' => 'x'], $this->as($other))->assertNotFound();
        $this->postJson("/api/support/portal/tickets/$id/close", [], $this->as($other))->assertNotFound();
    }

    public function test_the_teams_reply_is_emailed_to_the_customer(): void
    {
        $token = $this->signUp();
        $id = $this->postJson('/api/support/portal/tickets', [
            'title' => 'Թեմա', 'product' => '1C:Մանրածախ', 'priority' => 'normal', 'description' => 'Նկարագրություն այստեղ',
        ], $this->as($token))->json('id');

        \App\Filament\Resources\SupportTicketResource::reply(SupportTicket::find($id), ['body' => 'Ստուգեցինք, ուղղված է', 'solve' => true]);

        $this->getJson("/api/support/portal/tickets/$id", $this->as($token))
            ->assertJsonPath('status', 'solved')
            ->assertJsonPath('responses.0.author', 'staff')
            ->assertJsonPath('responses.0.body', 'Ստուգեցինք, ուղղված է');
        $mails = $this->sentMail();
        $this->assertCount(1, $mails);
        $this->assertStringContainsString('ani@example.test', $mails[0]->getEnvelope()->getRecipients()[0]->getAddress());
    }

    public function test_marking_solved_emails_the_customer_once(): void
    {
        $token = $this->signUp();
        $new = fn () => $this->postJson('/api/support/portal/tickets', [
            'title' => 'Թեմա', 'product' => '1C:Մանրածախ', 'priority' => 'normal', 'description' => 'Նկարագրություն այստեղ',
        ], $this->as($token))->json('id');

        // From the admin panel's Edit (or Telegram): one "solved" email.
        $a = SupportTicket::find($new());
        $a->update(['status' => 'solved']);
        $this->assertCount(1, $this->sentMail());
        $this->assertStringContainsString('լուծված է', $this->sentMail()[0]->getOriginalMessage()->getSubject());

        // A reply that also marks it solved: only the reply's email.
        \App\Filament\Resources\SupportTicketResource::reply(SupportTicket::find($new()), ['body' => 'Ուղղված է', 'solve' => true]);
        $this->assertCount(2, $this->sentMail());

        // The customer closing it themselves: no email.
        $this->postJson('/api/support/portal/tickets/'.$new().'/close', [], $this->as($token))->assertOk();
        $this->assertCount(2, $this->sentMail());
    }

    public function test_password_reset_by_email(): void
    {
        $this->signUp();
        $this->postJson('/api/support/portal/password/forgot', ['email' => 'nobody@example.test'])->assertOk();
        $this->assertCount(0, $this->sentMail());

        $this->postJson('/api/support/portal/password/forgot', ['email' => 'ani@example.test'])->assertOk();
        $mail = $this->sentMail()[0]->getOriginalMessage()->getTextBody();
        preg_match('/reset=([A-Za-z0-9]+)/', $mail, $m);

        $this->postJson('/api/support/portal/password/reset', ['email' => 'ani@example.test', 'token' => 'wrong', 'password' => 'new-secret-1'])->assertStatus(422);
        $this->postJson('/api/support/portal/password/reset', ['email' => 'ani@example.test', 'token' => $m[1], 'password' => 'new-secret-1'])->assertOk();
        $this->postJson('/api/support/portal/login', ['email' => 'ani@example.test', 'password' => 'new-secret-1'])->assertOk();
        $this->postJson('/api/support/portal/password/reset', ['email' => 'ani@example.test', 'token' => $m[1], 'password' => 'again-secret'])->assertStatus(422);
    }

    public function test_fluent_html_keeps_pictures_and_links(): void
    {
        $this->assertSame(
            "Ուղղված է\n🖼 http://flexit.am/a.png\n\nՆկար (https://prnt.sc/x) և https://e.am",
            FluentImport::text('<p>Ուղղված է<img style="width:300px" src="http://flexit.am/a.png" alt="x" /></p><p><a href="https://prnt.sc/x" target="_blank">Նկար</a> և <a href="https://e.am">https://e.am</a></p>')
        );
    }

    public function test_fluent_support_import_keeps_history_and_passwords(): void
    {
        $export = [
            'customers' => [['id' => 16, 'first_name' => 'Milon', 'last_name' => 'Group', 'email' => 'Info@Milon.test', 'created_at' => '2025-01-10 10:00:00']],
            'tickets' => [[
                'id' => 104, 'customer_id' => '16', 'title' => 'Оптимизация в 1С', 'status' => 'active', 'client_priority' => 'critical',
                'content' => '<ol><li>Возврат на кассе.</li><li>Долги &amp; клиенты</li></ol>', 'created_at' => '2026-10-01 09:00:00',
                'responses' => [
                    ['id' => 900, 'person_type' => 'agent', 'person' => ['full_name' => 'Karen'], 'content' => '<p>Сделаем завтра</p>', 'created_at' => '2026-10-01 10:00:00'],
                    ['id' => 901, 'person_type' => 'customer', 'person' => ['full_name' => 'Milon Group'], 'content' => 'Спасибо', 'created_at' => '2026-10-01 11:00:00'],
                ],
            ]],
        ];
        $csv = "\"ID\",\"user_login\",\"user_pass\",\"user_email\"\n\"21\",\"milon\",\"\$P\$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0\",\"info@milon.test\"\n";

        $counts = app(FluentImport::class)->run($export, FluentImport::passwordsFromCsv($csv));
        $this->assertSame(['customers' => 1, 'tickets' => 1, 'responses' => 2, 'passwords' => 1], $counts);
        // A second run updates rather than doubles.
        app(FluentImport::class)->run($export, FluentImport::passwordsFromCsv($csv));
        $this->assertSame(1, SupportTicket::count());
        $this->assertSame(2, SupportResponse::count());

        $ticket = SupportTicket::first();
        $this->assertSame('in_progress', $ticket->status);
        $this->assertSame("• Возврат на кассе.\n• Долги & клиенты", $ticket->description);
        $this->assertSame('2026-10-01 09:00', $ticket->created_at->format('Y-m-d H:i'));

        $token = $this->postJson('/api/support/portal/login', ['email' => 'info@milon.test', 'password' => 'test12345'])->assertOk()->json('token');
        $this->getJson('/api/support/portal/tickets/'.$ticket->id, $this->as($token))
            ->assertJsonPath('responses.0.author', 'staff')
            ->assertJsonPath('responses.0.body', 'Сделаем завтра')
            ->assertJsonPath('responses.1.author', 'customer');
    }
}
