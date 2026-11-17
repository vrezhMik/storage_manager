<?php

namespace App\Jobs;

use App\Models\SupportResponse;
use App\Services\Support\SupportTelegram;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Tells the team in Telegram that a customer answered in the portal.
 */
class PostSupportResponse implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [10, 60];

    public function __construct(public int $responseId) {}

    public function handle(SupportTelegram $telegram): void
    {
        $response = SupportResponse::with('ticket')->find($this->responseId);

        if ($response && $telegram->enabled()) {
            $telegram->postResponse($response->ticket, $response);
            $telegram->refresh($response->ticket);
        }
    }
}
