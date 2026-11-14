<?php

namespace Tests\Feature;

use App\Models\DbEntry;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CatalogTest extends TestCase
{
    use RefreshDatabase;

    private const SHOP = 'https://shop.test/wp-json/wc/store';

    private function user(array $entry = [], bool $restricted = false): User
    {
        $entry = DbEntry::create($entry + [
            'name' => 'Test 1C',
            'username' => 'terminal',
            'password' => 'secret',
            'api_get_purchase' => 'http://1c.test/purchases',
            'api_get_orders' => 'http://1c.test/orders',
            'api_post_orders' => 'http://1c.test/orders',
            'api_post_purchases' => 'http://1c.test/purchases',
            'catalog_url' => 'https://shop.test/',
            'api_stock' => 'http://1c.test/terminal/hs/Eportal/Stock',
            'allowed_ips' => '127.0.0.1',
        ]);
        @unlink(storage_path('app/private/catalog/'.$entry->id.'.json'));

        return User::create([
            'name' => 'Seller',
            'email' => 'seller'.$entry->id.'@example.test',
            'password' => 'password',
            'db_entry_id' => $entry->id,
            'can_sales' => true,
            'network_restricted' => $restricted,
        ]);
    }

    private function asUser(User $user, string $url)
    {
        config(['app.jwt_secret' => 'test-secret']);
        $token = JWT::encode(['sub' => $user->id, 'type' => 'access', 'exp' => time() + 600], 'test-secret', 'HS256');

        return $this->getJson($url, ['Authorization' => 'Bearer '.$token]);
    }

    private function product(int $id, string $sku, string $price, array $categories = []): array
    {
        return [
            'id' => $id,
            'name' => 'Փական &#8220;V-189&#8221;',
            'type' => 'simple',
            'sku' => $sku,
            'prices' => ['price' => $price, 'currency_minor_unit' => 0],
            'images' => [[
                'src' => 'https://shop.test/big.jpg',
                'thumbnail' => 'https://shop.test/thumb-800.jpg',
                'srcset' => 'https://shop.test/big.jpg 1920w, https://shop.test/s-225.jpg 225w, https://shop.test/s-150.jpg 150w, https://shop.test/s-100.jpg 100w',
            ]],
            'categories' => array_map(fn ($c) => ['id' => $c], $categories),
        ];
    }

    private function fakeShop(): void
    {
        Http::fake([
            'shop.test/wp-json/wc/store/v1/*' => Http::response(['code' => 'rest_no_route'], 404),
            'shop.test/wp-json/wc/store/products/categories*' => Http::response([
                ['id' => 5, 'name' => 'Դռներ &amp; պարագաներ', 'parent' => 0],
                ['id' => 6, 'name' => 'Փականներ', 'parent' => 5],
            ], 200, ['X-WP-TotalPages' => '1']),
            'shop.test/wp-json/wc/store/products*' => function (Request $request) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);
                if (($q['per_page'] ?? '') === '1') {
                    return Http::response([$this->product(1, 'ЦБ-1', '6800')], 200, ['X-WP-TotalPages' => '2']);
                }

                return ($q['page'] ?? '1') === '1'
                    ? Http::response([$this->product(1, 'ЦБ-1', '6800', [5, 6]), $this->product(2, ' ЦБ-2 ', '1500')], 200, ['X-WP-TotalPages' => '2'])
                    : Http::response([], 200, ['X-WP-TotalPages' => '2']);
            },
        ]);
    }

    public function test_reads_the_woocommerce_site_into_a_compact_catalog(): void
    {
        $this->fakeShop();

        $res = $this->asUser($this->user(), '/api/sales/catalog')->assertOk();

        $res->assertJsonPath('source', 'https://shop.test/')
            ->assertJsonPath('groups.0', ['id' => 5, 'name' => 'Դռներ & պարագաներ', 'parent' => null])
            ->assertJsonPath('groups.1.parent', 5)
            ->assertJsonPath('items.0', [
                'code' => 'ЦБ-1',
                'name' => 'Փական “V-189”',
                'price' => 6800,
                'image' => 'https://shop.test/s-150.jpg',
                'imageLarge' => 'https://shop.test/big.jpg',
                'groups' => [5, 6],
            ])
            ->assertJsonPath('items.1.code', 'ЦБ-2')
            ->assertJsonCount(2, 'items');
    }

    public function test_the_site_is_read_once_for_all_users_of_the_company(): void
    {
        $this->fakeShop();
        $user = $this->user();

        $this->asUser($user, '/api/sales/catalog')->assertOk();
        $reads = count(Http::recorded());
        $this->asUser($user, '/api/sales/catalog')->assertOk();
        $this->asUser($user, '/api/sales/catalog?refresh=1')->assertOk();

        $this->assertSame($reads, count(Http::recorded()));
    }

    public function test_keeps_the_last_catalog_when_the_site_is_down(): void
    {
        $this->fakeShop();
        $user = $this->user();
        $this->asUser($user, '/api/sales/catalog')->assertOk();
        touch(storage_path('app/private/catalog/'.$user->db_entry_id.'.json'), time() - 7 * 3600);

        Http::fake(['*' => Http::response('down', 500)]);

        $this->asUser($user, '/api/sales/catalog')->assertOk()->assertJsonCount(2, 'items');
    }

    public function test_needs_a_catalog_site_and_the_sales_section(): void
    {
        $this->asUser($this->user(['catalog_url' => null]), '/api/sales/catalog')->assertStatus(400);

        $user = $this->user(['name' => 'Other']);
        $user->update(['can_sales' => false]);
        $this->asUser($user, '/api/sales/catalog')->assertForbidden();
    }

    public function test_asks_1c_for_the_stock_of_several_codes_at_once(): void
    {
        Http::fake(['1c.test/*' => Http::response([['Code' => 'ЦБ-1', 'Stock' => 3, 'Unit' => 'հատ']])]);

        $this->asUser($this->user(), '/api/sales/stock?codes=ЦБ-1,ЦБ-2,ЦБ-1')
            ->assertOk()
            ->assertJsonPath('0.Stock', 3);

        Http::assertSent(fn (Request $r) => $r->url() === 'http://1c.test/terminal/hs/Eportal/Stock?Codes=%D0%A6%D0%91-1%2C%D0%A6%D0%91-2'
            && $r->hasHeader('Accept', '*/*'));
    }

    public function test_network_restricted_users_ask_1c_from_their_device(): void
    {
        Http::fake();

        $this->asUser($this->user([], true), '/api/sales/stock?codes=A1&device=1')
            ->assertOk()
            ->assertJsonPath('url', 'http://1c.test/terminal/hs/Eportal/Stock?Codes=A1')
            ->assertJsonPath('headers.Accept', '*/*');
        Http::assertNothingSent();
    }

    public function test_partners_come_from_1c_filtered_by_the_users_manager(): void
    {
        Http::fake(['1c.test/*' => Http::response([['TIN' => '01234567', 'Name' => 'Ռուբեն', 'Address' => 'Երևան']])]);
        $user = $this->user(['api_partners' => 'http://1c.test/terminal/hs/Eportal/Partners']);

        $this->asUser($user, '/api/sales/partners')->assertOk()->assertJsonPath('0.TIN', '01234567');
        Http::assertSent(fn (Request $r) => $r->url() === 'http://1c.test/terminal/hs/Eportal/Partners');

        $user->update(['partners_manager' => 'Արամ Պետրոսյան']);
        $this->asUser($user->fresh(), '/api/sales/partners')->assertOk();
        Http::assertSent(fn (Request $r) => $r->url() === 'http://1c.test/terminal/hs/Eportal/Partners?Manager=%D4%B1%D6%80%D5%A1%D5%B4%20%D5%8A%D5%A5%D5%BF%D6%80%D5%B8%D5%BD%D5%B5%D5%A1%D5%B6');
    }

    public function test_partners_need_an_endpoint(): void
    {
        $this->asUser($this->user(), '/api/sales/partners')->assertStatus(400);
    }

    public function test_stock_needs_codes_and_an_endpoint(): void
    {
        $user = $this->user();
        $this->asUser($user, '/api/sales/stock')->assertStatus(422);
        $this->asUser($user, '/api/sales/stock?codes='.implode(',', range(1, 101)))->assertStatus(422);

        $this->asUser($this->user(['name' => 'Other', 'api_stock' => null]), '/api/sales/stock?codes=A1')->assertStatus(400);
    }
}
