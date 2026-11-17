<?php

namespace App\Jobs;

use App\Models\SupportTicket;
use App\Services\Support\SupportTelegram;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Posts a new ticket to the team's Telegram chat, retrying if Telegram is slow.
 */
class PostSupportTicket implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [10, 60];

    public function __construct(public int $ticketId) {}

    public function handle(SupportTelegram $telegram): void
    {
        $ticket = SupportTicket::find($this->ticketId);

        if ($ticket && ! $ticket->telegram_message_id && $telegram->enabled()) {
            $telegram->postTicket($ticket);
        }
    }
}
