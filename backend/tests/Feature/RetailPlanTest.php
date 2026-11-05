<?php

namespace Tests\Feature;

use App\Models\DbEntry;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RetailPlanTest extends TestCase
{
    use RefreshDatabase;

    private function userWithRetail(bool $canRetail, ?string $store = null): User
    {
        $entry = DbEntry::create([
            'name' => 'Test 1C',
            'username' => 'terminal',
            'password' => 'secret',
            'api_get_purchase' => 'http://1c.test/purchases',
            'api_get_orders' => 'http://1c.test/orders',
            'api_post_orders' => 'http://1c.test/orders',
            'api_post_purchases' => 'http://1c.test/purchases',
            'api_retail_plan' => 'http://1c.test/terminal/hs/Eportal/RetailPlan?Date=',
        ]);

        return User::create([
            'name' => 'Retail',
            'email' => 'retail@example.test',
            'password' => 'password',
            'db_entry_id' => $entry->id,
            'can_retail' => $canRetail,
            'retail_store' => $store,
        ]);
    }

    private function token(User $user): string
    {
        config(['app.jwt_secret' => 'test-secret']);

        return JWT::encode(['sub' => $user->id, 'type' => 'access', 'exp' => time() + 600], 'test-secret', 'HS256');
    }

    public function test_retail_is_off_by_default(): void
    {
        $user = $this->userWithRetail(false);

        $this->assertFalse($user->fresh()->sections['retail']);
        $this->getJson('/api/retail-plan', ['Authorization' => 'Bearer '.$this->token($user)])
            ->assertForbidden();
    }

    public function test_sends_the_date_to_1c_and_returns_its_answer(): void
    {
        Http::fake(['1c.test/*' => Http::response(['Date' => '2026-11-05', 'Stores' => [['Магазин' => 'Մաշտոց', 'Продажи' => 1500, 'План' => 6000]]])]);
        $user = $this->userWithRetail(true);

        $this->getJson('/api/retail-plan?date=2026-11-05', ['Authorization' => 'Bearer '.$this->token($user)])
            ->assertOk()
            ->assertJsonPath('Stores.0.План', 6000);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'RetailPlan')
            && $request['Date'] === '05.11.2026'
            && ! isset($request['Store']));
    }

    public function test_a_store_user_gets_only_its_own_store(): void
    {
        Http::fake(['1c.test/*' => Http::response(['Stores' => []])]);
        $user = $this->userWithRetail(true, 'Մաշտոց 12');

        // A store asked for in the URL is ignored: the store comes from the account.
        $this->getJson('/api/retail-plan?date=2026-11-05&Store=Կոմիտաս', ['Authorization' => 'Bearer '.$this->token($user)])
            ->assertOk();

        Http::assertSent(fn ($request) => $request['Store'] === 'Մաշտոց 12');
    }

    public function test_rejects_a_bad_date(): void
    {
        $user = $this->userWithRetail(true);

        $this->getJson('/api/retail-plan?date=2026-13-40', ['Authorization' => 'Bearer '.$this->token($user)])
            ->assertUnprocessable();
    }
}
