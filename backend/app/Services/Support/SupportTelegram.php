<?php

namespace App\Services\Support;

use App\Models\SupportTicket;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * The support bot: posts each ticket to the team's chat with buttons
 * ("Վերցնում եմ", "Լուծված") and keeps that message up to date.
 */
class SupportTelegram
{
    private const API = 'https://api.telegram.org/bot';

    public function enabled(): bool
    {
        return filled(config('services.support_telegram.token')) && filled(config('services.support_telegram.chat_id'));
    }

    public function chatId(): string
    {
        return (string) config('services.support_telegram.chat_id');
    }

    public function postTicket(SupportTicket $ticket): void
    {
        $sent = $this->call('sendMessage', [
            'chat_id' => $this->chatId(),
            'text' => $this->text($ticket),
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
            'reply_markup' => $this->keyboard($ticket),
        ]);
        $messageId = $sent->json('result.message_id');
        $ticket->forceFill(['telegram_message_id' => $messageId])->save();

        foreach ($ticket->attachments ?? [] as $i => $path) {
            if (! is_string($path) || ! Storage::disk('local')->exists($path)) {
                continue;
            }
            $this->upload(SupportTicket::isImage($path) ? 'sendPhoto' : 'sendDocument', SupportTicket::isImage($path) ? 'photo' : 'document', Storage::disk('local')->get($path), SupportTicket::fileLabel($path, $i), [
                'chat_id' => $this->chatId(),
                'caption' => '№'.$ticket->id.' · '.($i + 1),
                'reply_to_message_id' => $messageId,
            ]);
        }
    }

    // A customer's reply in the portal, under the ticket's message.
    public function postResponse(SupportTicket $ticket, \App\Models\SupportResponse $response): void
    {
        $e = fn (?string $s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $sent = $this->call('sendMessage', array_filter([
            'chat_id' => $this->chatId(),
            'text' => '💬 <b>Հայտ №'.$ticket->id.'</b> · նոր պատասխան՝ '.$e($response->author_name)."\n\n"
                .$e(mb_strimwidth($response->body, 0, 3000, '…')),
            'parse_mode' => 'HTML',
            'reply_to_message_id' => $ticket->telegram_message_id,
            'allow_sending_without_reply' => true,
        ]));
        foreach ($response->attachments ?? [] as $i => $path) {
            if (is_string($path) && Storage::disk('local')->exists($path)) {
                $this->upload(SupportTicket::isImage($path) ? 'sendPhoto' : 'sendDocument', SupportTicket::isImage($path) ? 'photo' : 'document', Storage::disk('local')->get($path), SupportTicket::fileLabel($path, $i), [
                    'chat_id' => $this->chatId(),
                    'caption' => '№'.$ticket->id.' · '.($i + 1),
                    'reply_to_message_id' => $sent->json('result.message_id'),
                ]);
            }
        }
    }

    // Redraws the ticket's message after it was taken or solved.
    public function refresh(SupportTicket $ticket): void
    {
        if (! $ticket->telegram_message_id) {
            return;
        }
        $this->call('editMessageText', [
            'chat_id' => $this->chatId(),
            'message_id' => $ticket->telegram_message_id,
            'text' => $this->text($ticket),
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
            'reply_markup' => $this->keyboard($ticket),
        ]);
    }

    public function answerCallback(string $callbackId, string $text): void
    {
        $this->call('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => $text]);
    }

    public function say(string|int $chatId, string $text): void
    {
        $this->call('sendMessage', ['chat_id' => $chatId, 'text' => $text]);
    }

    public function setWebhook(string $url, string $secret): array
    {
        return $this->call('setWebhook', [
            'url' => $url,
            'secret_token' => $secret,
            'allowed_updates' => ['message', 'callback_query'],
        ])->json();
    }

    public function text(SupportTicket $ticket): string
    {
        $e = fn (?string $s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $urgent = $ticket->urgent || $ticket->priority === 'critical';
        $lines = [
            ($urgent ? '🔴 <b>ՇՏԱՊ</b> · ' : '🆕 ').'<b>Հայտ №'.$ticket->id.'</b>'
                .($ticket->customer?->contract ? ' · ⭐ պայմանագրային' : ''),
        ];
        if ($ticket->title) {
            $lines[] = '<b>'.$e($ticket->title).'</b>';
        }
        $lines[] = '👤 '.$e($ticket->name).($ticket->company ? ' · '.$e($ticket->company) : '');
        $lines[] = '📞 '.$e($ticket->phone).($ticket->customer?->email ? ' · '.$e($ticket->customer->email) : '');
        if ($ticket->tin) {
            $lines[] = '🏷 ՀՎՀՀ '.$e($ticket->tin);
        }
        $lines[] = '💻 '.$e($ticket->product);
        $lines[] = '';
        $lines[] = $e(mb_strimwidth($ticket->description, 0, 2500, '…'));
        if ($ticket->attachments) {
            $lines[] = '';
            $lines[] = '📎 Նկարներ՝ '.count($ticket->attachments);
        }
        if ($ticket->taken_at) {
            $lines[] = '';
            $lines[] = '✋ Վերցրեց՝ '.$e($ticket->assignee).' · '.$ticket->taken_at->timezone('Asia/Yerevan')->format('H:i');
        }
        if ($ticket->status === SupportTicket::STATUS_SOLVED) {
            $lines[] = '✅ Լուծված'.($ticket->solved_at ? ' · '.$ticket->solved_at->timezone('Asia/Yerevan')->format('d.m H:i') : '');
        }

        return implode("\n", $lines);
    }

    private function keyboard(SupportTicket $ticket): array
    {
        $row = match ($ticket->status) {
            SupportTicket::STATUS_NEW => [['text' => '✋ Վերցնում եմ', 'callback_data' => 'take:'.$ticket->id]],
            SupportTicket::STATUS_IN_PROGRESS => [['text' => '✅ Լուծված է', 'callback_data' => 'solve:'.$ticket->id]],
            default => [],
        };
        $row[] = ['text' => '🔗 Ադմինկա', 'url' => rtrim((string) config('app.url'), '/').'/admin/support-tickets?tableSearch='.$ticket->id];

        return ['inline_keyboard' => [$row]];
    }

    private function call(string $method, array $params): Response
    {
        $response = Http::timeout(20)->asJson()->post($this->url($method), $params);
        if (! $response->successful() || ! $response->json('ok')) {
            throw new RuntimeException('Telegram '.$method.' failed: '.$response->status().' '.mb_substr($response->body(), 0, 300));
        }

        return $response;
    }

    private function upload(string $method, string $field, string $contents, string $name, array $params): void
    {
        $response = Http::timeout(60)->attach($field, $contents, $name)->post($this->url($method), $params);
        if (! $response->successful()) {
            throw new RuntimeException('Telegram '.$method.' failed: '.$response->status());
        }
    }

    private function url(string $method): string
    {
        return self::API.config('services.support_telegram.token').'/'.$method;
    }
}
