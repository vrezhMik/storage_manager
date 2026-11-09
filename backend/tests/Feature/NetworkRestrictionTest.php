<?php

namespace Tests\Feature;

use App\Models\DbEntry;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NetworkRestrictionTest extends TestCase
{
    use RefreshDatabase;

    private const OFFICE = '203.0.113.5';

    private const OUTSIDE = '198.51.100.7';

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(['1c.test/*' => Http::response(['ok' => true])]);
    }

    private function user(bool $restricted, ?string $allowedIps = self::OFFICE): User
    {
        $entry = DbEntry::create([
            'name' => 'Test 1C',
            'username' => 'terminal',
            'password' => 'secret',
            'api_get_purchase' => 'http://1c.test/purchases',
            'api_get_orders' => 'http://1c.test/orders',
            'api_post_orders' => 'http://1c.test/orders',
            'api_post_purchases' => 'http://1c.test/purchases',
            'api_price_check' => 'http://1c.test/price',
            'api_sales_monthly' => 'http://1c.test/monthly',
            'api_retail_plan' => 'http://1c.test/plan',
            'api_retail_suppliers' => 'http://1c.test/suppliers',
            'allowed_ips' => $allowedIps,
        ]);

        return User::create([
            'name' => 'Cashier',
            'email' => 'cashier@example.test',
            'password' => 'password',
            'db_entry_id' => $entry->id,
            'can_retail' => true,
            'can_price_check' => true,
            'can_reports' => true,
            'network_restricted' => $restricted,
        ]);
    }

    private function getFrom(string $ip, string $url, User $user, array $headers = [])
    {
        config(['app.jwt_secret' => 'test-secret']);
        $token = JWT::encode(['sub' => $user->id, 'type' => 'access', 'exp' => time() + 600], 'test-secret', 'HS256');

        return $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->getJson($url, ['Authorization' => 'Bearer '.$token] + $headers);
    }

    public function test_marked_user_is_stopped_outside_the_network(): void
    {
        $user = $this->user(true);

        foreach (['/api/retail-plan', '/api/retail-suppliers', '/api/price-check?barcode=1'] as $url) {
            $this->getFrom(self::OUTSIDE, $url, $user)
                ->assertForbidden()
                ->assertJson(['code' => 'network_restricted', 'ip' => self::OUTSIDE]);
        }
        Http::assertNothingSent();
    }

    public function test_the_app_gets_no_1c_request_outside_the_network(): void
    {
        $this->getFrom(self::OUTSIDE, '/api/retail-plan?device=1', $this->user(true))
            ->assertForbidden()
            ->assertJsonMissingPath('url');
    }

    public function test_marked_user_works_inside_the_network(): void
    {
        $user = $this->user(true);

        $this->getFrom(self::OFFICE, '/api/retail-plan', $user)->assertOk();
        $this->getFrom(self::OFFICE, '/api/price-check?barcode=1', $user)->assertOk();
    }

    public function test_marked_users_price_check_goes_through_the_device(): void
    {
        $user = $this->user(true);

        $this->getFrom(self::OFFICE, '/api/price-check?barcode=12%2034&device=1', $user)
            ->assertOk()
            ->assertJsonPath('url', 'http://1c.test/price?Barcode=12%2034')
            ->assertJsonPath('headers.Accept', '*/*')
            ->assertJsonPath('headers.Authorization', 'Basic '.base64_encode('terminal:secret'));

        $user->dbEntry->update(['api_price_check' => 'http://1c.test/price?Barcode=']);

        $this->getFrom(self::OFFICE, '/api/price-check?barcode=5&device=1', $user->fresh())
            ->assertJsonPath('url', 'http://1c.test/price?Barcode=5')
            ->assertJsonPath('headers.Accept', '*/*');
        Http::assertNothingSent();
    }

    public function test_unmarked_users_price_check_stays_on_the_server(): void
    {
        $this->getFrom(self::OUTSIDE, '/api/price-check?barcode=1&device=1', $this->user(false))
            ->assertOk()
            ->assertJsonMissingPath('url')
            ->assertJson(['ok' => true]);
    }

    public function test_list_takes_several_addresses_and_ranges(): void
    {
        $user = $this->user(true, "192.0.2.1\n203.0.113.0/24");

        $this->getFrom(self::OFFICE, '/api/retail-plan', $user)->assertOk();
        $this->getFrom('192.0.2.1', '/api/retail-plan', $user)->assertOk();
        $this->getFrom(self::OUTSIDE, '/api/retail-plan', $user)->assertForbidden();
    }

    public function test_marked_user_with_an_empty_list_is_stopped(): void
    {
        $this->getFrom(self::OFFICE, '/api/retail-plan', $this->user(true, null))->assertForbidden();
    }

    public function test_other_sections_stay_open(): void
    {
        $this->getFrom(self::OUTSIDE, '/api/sales-monthly?start=2026-11-01&end=2026-11-05', $this->user(true))->assertOk();
    }

    public function test_user_without_the_mark_works_anywhere(): void
    {
        $this->getFrom(self::OUTSIDE, '/api/retail-plan', $this->user(false))->assertOk();
    }

    public function test_forged_forwarded_header_does_not_help(): void
    {
        $this->getFrom(self::OUTSIDE, '/api/retail-plan', $this->user(true), ['X-Forwarded-For' => self::OFFICE])
            ->assertForbidden();
    }
}
