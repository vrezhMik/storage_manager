<?php

namespace Tests\Unit;

use App\Services\Assistant\DataIntentParser;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DataIntentParserTest extends TestCase
{
    private function fakeModel(array $answer): void
    {
        config(['services.ollama.chat_model' => 'test-model', 'services.ollama.url' => 'http://ollama.test']);
        Http::fake(['ollama.test/*' => Http::response(['message' => ['content' => json_encode($answer)]])]);
    }

    public function test_reads_the_model_answer(): void
    {
        $this->fakeModel(['topic' => 'sales_by_manager', 'start' => '2026-10-01', 'end' => '2026-10-29', 'order' => 'desc', 'limit' => 3]);

        $intent = app(DataIntentParser::class)->parse('Ով է այս ամիս ամենաշատը վաճառել', Carbon::parse('2026-10-29'));

        $this->assertSame(['topic' => 'sales_by_manager', 'start' => '2026-10-01', 'end' => '2026-10-29', 'order' => 'desc', 'limit' => 3], $intent);
        Http::assertSent(fn ($r) => $r['model'] === 'test-model' && $r['format']['required'] === ['topic']);
    }

    public function test_drops_values_it_cannot_use(): void
    {
        $parser = app(DataIntentParser::class);
        $today = Carbon::parse('2026-10-29');

        $this->assertSame(['topic' => 'none'], $parser->validate(['topic' => 'weather'], $today));
        $this->assertSame(['topic' => 'none'], $parser->validate(['topic' => 'customer'], $today));
        $intent = $parser->validate(['topic' => 'top_items', 'start' => '2026-10-20', 'end' => '2027-01-01', 'limit' => 500, 'order' => 'up'], $today);
        $this->assertSame('2026-10-29', $intent['end']);
        $this->assertSame(50, $intent['limit']);
        $this->assertArrayNotHasKey('order', $intent);
        $this->assertArrayNotHasKey('start', $parser->validate(['topic' => 'sales_total', 'start' => '2026-13-01', 'end' => '2026-10-29'], $today));
        $this->assertSame(['topic' => 'customer', 'partner' => 'Մեգա ՍՊԸ'], $parser->validate(['topic' => 'customer', 'partner' => ' Մեգա ՍՊԸ '], $today));
    }

    public function test_is_off_without_a_model(): void
    {
        config(['services.ollama.chat_model' => '']);
        $this->assertFalse(app(DataIntentParser::class)->enabled());
    }
}
