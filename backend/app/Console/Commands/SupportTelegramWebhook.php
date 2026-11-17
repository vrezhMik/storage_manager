<?php

namespace App\Console\Commands;

use App\Services\Support\SupportTelegram;
use Illuminate\Console\Command;

/**
 * Points the support bot at this server, so its buttons and /chatid work.
 */
class SupportTelegramWebhook extends Command
{
    protected $signature = 'support:telegram-webhook';

    protected $description = 'Register the support bot webhook with Telegram';

    public function handle(SupportTelegram $telegram): int
    {
        $secret = (string) config('services.support_telegram.webhook_secret');
        if (blank(config('services.support_telegram.token')) || strlen($secret) < 16) {
            $this->error('Set SUPPORT_TELEGRAM_BOT_TOKEN and SUPPORT_TELEGRAM_WEBHOOK_SECRET (16+ letters/digits) in .env first.');

            return self::FAILURE;
        }

        $url = rtrim((string) config('app.url'), '/').'/api/telegram/support/'.$secret;
        $answer = $telegram->setWebhook($url, $secret);
        $this->info(($answer['ok'] ?? false) ? 'Webhook set. Send /chatid to the bot (or in the group) to see the chat id.' : 'Telegram said: '.json_encode($answer));

        return ($answer['ok'] ?? false) ? self::SUCCESS : self::FAILURE;
    }
}
