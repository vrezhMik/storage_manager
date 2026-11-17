<?php

namespace Tests\Feature;

use App\Models\SupportTicket;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupportTicketTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-webhook-secret-123';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.support_telegram.token' => 'BOT',
            'services.support_telegram.chat_id' => '-100555',
            'services.support_telegram.webhook_secret' => self::SECRET,
            'app.url' => 'https://admin.flexit.am',
        ]);
        Storage::fake('local');
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 77]])]);
    }

    private function ticket(array $over = []): array
    {
        return $over + [
            'name' => 'Անի',
            'phone' => '+374 91 123456',
            'company' => 'Ռուբեն ՍՊԸ',
            'product' => '1C:Հաշվապահություն',
            'urgent' => '1',
            'description' => 'Իրացումը չի անցկացվում <b>սխալ</b> է տալիս',
        ];
    }

    private function button(string $data, string $chat = '-100555')
    {
        return $this->postJson('/api/telegram/support/'.self::SECRET, [
            'callback_query' => [
                'id' => 'cb1',
                'data' => $data,
                'from' => ['first_name' => 'Կարեն', 'last_name' => 'Ս.'],
                'message' => ['chat' => ['id' => (int) $chat]],
            ],
        ], ['X-Telegram-Bot-Api-Secret-Token' => self::SECRET]);
    }

    public function test_anyone_registers_a_problem_and_the_team_gets_it_in_telegram(): void
    {
        $res = $this->post('/api/support/tickets', $this->ticket([
            'files' => [UploadedFile::fake()->image('screen.png')],
        ]), ['Accept' => 'application/json'])->assertCreated();

        $ticket = SupportTicket::findOrFail($res->json('id'));
        $this->assertSame('new', $ticket->status);
        $this->assertTrue($ticket->urgent);
        $this->assertSame(77, (int) $ticket->telegram_message_id);
        Storage::disk('local')->assertExists($ticket->attachments[0]);
        $this->assertArrayNotHasKey('phone', $res->json());

        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sendMessage')
            && $r['chat_id'] === '-100555'
            && str_contains($r['text'], 'ՇՏԱՊ')
            && str_contains($r['text'], 'Հայտ №'.$ticket->id)
            && str_contains($r['text'], '&lt;b&gt;սխալ&lt;/b&gt;')
            && $r['reply_markup']['inline_keyboard'][0][0]['callback_data'] === 'take:'.$ticket->id);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sendPhoto'));
    }

    public function test_the_form_is_checked(): void
    {
        $this->postJson('/api/support/tickets', $this->ticket(['phone' => 'abc']))->assertStatus(422);
        $this->postJson('/api/support/tickets', $this->ticket(['product' => 'Excel']))->assertStatus(422);
        $this->postJson('/api/support/tickets', $this->ticket(['description' => 'կարճ']))->assertStatus(422);
        $this->postJson('/api/support/tickets', $this->ticket(['website' => 'http://spam']))->assertStatus(422);
        $this->assertSame(0, SupportTicket::count());
        Http::assertNothingSent();
    }

    public function test_the_status_link_shows_no_personal_data(): void
    {
        $token = $this->postJson('/api/support/tickets', $this->ticket())->json('token');

        $this->getJson('/api/support/tickets/'.$token)
            ->assertOk()
            ->assertJsonPath('statusLabel', 'Նոր')
            ->assertJsonMissingPath('phone')
            ->assertJsonMissingPath('name');
        $this->getJson('/api/support/tickets/not-a-token')->assertNotFound();
    }

    public function test_take_and_solve_buttons_update_the_ticket_and_its_message(): void
    {
        $id = $this->postJson('/api/support/tickets', $this->ticket())->json('id');

        $this->button('take:'.$id)->assertOk();
        $ticket = SupportTicket::find($id);
        $this->assertSame('in_progress', $ticket->status);
        $this->assertSame('Կարեն Ս.', $ticket->assignee);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/editMessageText')
            && str_contains($r['text'], 'Վերցրեց՝ Կարեն Ս.')
            && $r['reply_markup']['inline_keyboard'][0][0]['callback_data'] === 'solve:'.$id);

        // A second "take" does not change hands.
        $this->button('take:'.$id)->assertOk();
        $this->assertSame('in_progress', $ticket->fresh()->status);

        $this->button('solve:'.$id)->assertOk();
        $this->assertSame('solved', $ticket->fresh()->status);
    }

    public function test_buttons_from_another_chat_or_without_the_secret_do_nothing(): void
    {
        $id = $this->postJson('/api/support/tickets', $this->ticket())->json('id');

        $this->button('take:'.$id, '-999')->assertOk();
        $this->assertSame('new', SupportTicket::find($id)->status);

        $this->postJson('/api/telegram/support/'.self::SECRET, ['callback_query' => ['id' => 'x', 'data' => 'take:'.$id]])->assertNotFound();
        $this->postJson('/api/telegram/support/wrong', [], ['X-Telegram-Bot-Api-Secret-Token' => 'wrong'])->assertNotFound();
        $this->assertSame('new', SupportTicket::find($id)->status);
    }

    public function test_chatid_command_tells_the_chat_id(): void
    {
        $this->postJson('/api/telegram/support/'.self::SECRET, ['message' => ['text' => '/chatid', 'chat' => ['id' => -100777]]],
            ['X-Telegram-Bot-Api-Secret-Token' => self::SECRET])->assertOk();

        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sendMessage') && $r['text'] === 'Chat ID: -100777');
    }

    public function test_without_a_bot_the_ticket_is_still_saved(): void
    {
        config(['services.support_telegram.token' => null]);

        $this->postJson('/api/support/tickets', $this->ticket())->assertCreated();
        $this->assertSame(1, SupportTicket::count());
        Http::assertNothingSent();
    }
}
