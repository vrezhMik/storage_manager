<?php

namespace Tests\Feature;

use App\Models\DbEntry;
use App\Models\SalesOrder;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SalesOrderTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $entry = [], array $user = []): User
    {
        $entry = DbEntry::create($entry + [
            'name' => 'Test 1C',
            'username' => 'terminal',
            'password' => 'secret',
            'api_get_purchase' => 'http://1c.test/purchases',
            'api_get_orders' => 'http://1c.test/orders',
            'api_post_orders' => 'http://1c.test/orders',
            'api_post_purchases' => 'http://1c.test/purchases',
            'api_sales_order' => 'http://1c.test/terminal/hs/Eportal/SalesOrder',
            'allowed_ips' => '127.0.0.1',
        ]);

        return User::create($user + [
            'name' => 'Seller',
            'email' => 'seller'.$entry->id.'@example.test',
            'password' => 'password',
            'db_entry_id' => $entry->id,
            'can_sales' => true,
            'partners_manager' => 'Արամ',
        ]);
    }

    private function api(User $user, string $method, string $url, array $data = [])
    {
        config(['app.jwt_secret' => 'test-secret']);
        $token = JWT::encode(['sub' => $user->id, 'type' => 'access', 'exp' => time() + 600], 'test-secret', 'HS256');

        return $this->json($method, $url, $data, ['Authorization' => 'Bearer '.$token]);
    }

    private function sale(array $over = []): array
    {
        return $over + [
            'buyerTin' => '01234567',
            'buyerName' => 'Ռուբեն ՍՊԸ',
            'buyerAddress' => 'Երևան',
            'deliveredAt' => '2026-11-15',
            'items' => [
                ['code' => '00-00000003', 'name' => 'Ավազ պարկով', 'unit' => 'հատ', 'quantity' => 2, 'price' => 300, 'image' => 'https://shop.test/a.jpg'],
                ['code' => '00-00000004', 'name' => 'Բռնակ', 'quantity' => 1.5, 'price' => 6800],
            ],
        ];
    }

    public function test_saves_changes_and_lists_the_users_own_sales(): void
    {
        $user = $this->user();
        $id = $this->api($user, 'POST', '/api/sales/orders', $this->sale())
            ->assertCreated()
            ->assertJsonPath('status', 'DRAFT')
            ->assertJsonPath('total', 10800)
            ->json('id');

        $this->api($user, 'PUT', "/api/sales/orders/$id", $this->sale(['comment' => 'Արագ']))
            ->assertOk()
            ->assertJsonPath('comment', 'Արագ');

        $other = $this->user(['name' => 'Other']);
        $this->api($other, 'GET', "/api/sales/orders/$id")->assertNotFound();
        $this->api($other, 'GET', '/api/sales/orders')->assertJsonCount(0, 'orders');
        $this->api($user, 'GET', '/api/sales/orders')->assertJsonCount(1, 'orders')->assertJsonPath('orders.0.items.0.image', 'https://shop.test/a.jpg');
    }

    public function test_needs_a_buyer_and_goods(): void
    {
        $user = $this->user();
        $this->api($user, 'POST', '/api/sales/orders', $this->sale(['buyerName' => '']))->assertStatus(422);
        $this->api($user, 'POST', '/api/sales/orders', $this->sale(['items' => []]))->assertStatus(422);
        $this->api($user, 'POST', '/api/sales/orders', $this->sale(['buyerTin' => '123']))->assertStatus(422);
    }

    public function test_sends_to_1c_and_keeps_its_number(): void
    {
        Http::fake(['1c.test/*' => Http::response(['Number' => 'ЗК-000123', 'Ref' => 'abc'])]);
        $user = $this->user();
        $id = $this->api($user, 'POST', '/api/sales/orders', $this->sale())->json('id');

        $this->api($user, 'POST', "/api/sales/orders/$id/send")
            ->assertOk()
            ->assertJsonPath('status', 'SENT')
            ->assertJsonPath('onecNumber', 'ЗК-000123');

        Http::assertSent(function (Request $r) {
            $body = json_decode($r->body(), true);

            return $r->method() === 'POST'
                && $r->url() === 'http://1c.test/terminal/hs/Eportal/SalesOrder'
                && $body['BuyerTIN'] === '01234567'
                && $body['Manager'] === 'Արամ'
                && $body['Date'] === '2026-11-15'
                && $body['Items'][1] === ['Code' => '00-00000004', 'Quantity' => 1.5, 'Price' => 6800];
        });

        // Sent sales stay as they are.
        $this->api($user, 'PUT', "/api/sales/orders/$id", $this->sale())->assertStatus(409);
        $this->api($user, 'DELETE', "/api/sales/orders/$id")->assertStatus(409);
    }

    public function test_a_refusal_keeps_the_sale_to_send_again(): void
    {
        Http::fake(['1c.test/*' => Http::response(['Error' => 'Не найден контрагент с ИНН 01234567'], 200)]);
        $user = $this->user();
        $id = $this->api($user, 'POST', '/api/sales/orders', $this->sale())->json('id');

        $this->api($user, 'POST', "/api/sales/orders/$id/send")
            ->assertStatus(502)
            ->assertJsonPath('status', 'FAILED')
            ->assertJsonPath('error', 'Не найден контрагент с ИНН 01234567');

        $this->api($user, 'PUT', "/api/sales/orders/$id", $this->sale())->assertOk()->assertJsonPath('status', 'DRAFT');
    }

    public function test_network_restricted_users_send_from_their_device(): void
    {
        Http::fake();
        $user = $this->user([], ['network_restricted' => true]);
        $id = $this->api($user, 'POST', '/api/sales/orders', $this->sale())->json('id');

        $spec = $this->api($user, 'POST', "/api/sales/orders/$id/send?device=1")->assertOk()->json('device');
        $this->assertSame('POST', $spec['method']);
        $this->assertSame('01234567', json_decode($spec['body'], true)['BuyerTIN']);
        Http::assertNothingSent();

        $this->api($user, 'POST', "/api/sales/orders/$id/device-result", ['status' => 200, 'body' => '{"Number":"ЗК-7"}'])
            ->assertOk()
            ->assertJsonPath('onecNumber', 'ЗК-7');
        $this->assertSame(SalesOrder::STATUS_SENT, SalesOrder::find($id)->status);
    }
}
