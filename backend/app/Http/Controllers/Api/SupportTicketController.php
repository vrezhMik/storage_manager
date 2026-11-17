<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\PostSupportTicket;
use App\Models\SupportTicket;
use App\Services\Support\SupportTelegram;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * The public side of "Խնդրի գրանցում": the form on flexit.am posts here, no
 * account needed, and the team gets the ticket in Telegram.
 */
class SupportTicketController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        // Bots fill the hidden "website" field; people never see it.
        if (filled($request->input('website'))) {
            return response()->json(['message' => 'Rejected'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:32', 'regex:/^[0-9+()\-\s]{6,32}$/'],
            'company' => ['nullable', 'string', 'max:160'],
            'tin' => ['nullable', 'regex:/^\d{8}$/'],
            'product' => ['required', Rule::in(SupportTicket::PRODUCTS)],
            'urgent' => ['nullable', 'boolean'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'source' => ['nullable', 'string', 'max:120'],
            'files' => ['nullable', 'array', 'max:3'],
            'files.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $ticket = SupportTicket::create([
            'status' => SupportTicket::STATUS_NEW,
            'name' => trim($data['name']),
            'phone' => trim($data['phone']),
            'company' => filled($data['company'] ?? null) ? trim($data['company']) : null,
            'tin' => $data['tin'] ?? null,
            'product' => $data['product'],
            'urgent' => (bool) ($data['urgent'] ?? false),
            'description' => trim($data['description']),
            'source' => $data['source'] ?? null,
            'ip' => $request->ip(),
        ]);

        $paths = [];
        foreach ($request->file('files', []) as $file) {
            $paths[] = $file->storeAs('support/'.$ticket->id, Str::random(24).'.'.$file->extension(), 'local');
        }
        if ($paths) {
            $ticket->update(['attachments' => $paths]);
        }

        PostSupportTicket::dispatch($ticket->id);

        return response()->json([
            'id' => $ticket->id,
            'token' => $ticket->token,
            'status' => $ticket->status,
            'statusLabel' => $ticket->statusLabel(),
        ], Response::HTTP_CREATED);
    }

    // What the person sees from the link they got: no personal data.
    public function show(string $token): JsonResponse
    {
        $ticket = SupportTicket::where('token', $token)->firstOrFail();

        return response()->json([
            'id' => $ticket->id,
            'status' => $ticket->status,
            'statusLabel' => $ticket->statusLabel(),
            'createdAt' => $ticket->created_at?->toIso8601String(),
        ]);
    }

    /**
     * Telegram calls this for the chat's buttons and for /chatid. The path and
     * Telegram's secret header both carry the webhook secret.
     */
    public function telegram(Request $request, string $secret, SupportTelegram $telegram): JsonResponse
    {
        $expected = (string) config('services.support_telegram.webhook_secret');
        if ($expected === '' || ! hash_equals($expected, $secret)
            || ! hash_equals($expected, (string) $request->header('X-Telegram-Bot-Api-Secret-Token'))) {
            abort(Response::HTTP_NOT_FOUND);
        }

        try {
            if ($callback = $request->input('callback_query')) {
                $this->button($callback, $telegram);
            } elseif (preg_match('#^/(start|chatid)#', (string) $request->input('message.text'))) {
                $chatId = $request->input('message.chat.id');
                $telegram->say($chatId, 'Chat ID: '.$chatId);
            }
        } catch (Throwable $e) {
            report($e);
        }

        // Always 200, or Telegram keeps resending the same update.
        return response()->json(['ok' => true]);
    }

    private function button(array $callback, SupportTelegram $telegram): void
    {
        if ((string) data_get($callback, 'message.chat.id') !== $telegram->chatId()) {
            $telegram->answerCallback($callback['id'], 'Այս չատից հնարավոր չէ');

            return;
        }
        if (! preg_match('/^(take|solve):(\d+)$/', (string) ($callback['data'] ?? ''), $m)) {
            return;
        }

        $ticket = SupportTicket::find($m[2]);
        if (! $ticket) {
            $telegram->answerCallback($callback['id'], 'Հայտը չգտնվեց');

            return;
        }

        $who = trim(data_get($callback, 'from.first_name', '').' '.data_get($callback, 'from.last_name', ''))
            ?: '@'.data_get($callback, 'from.username', '?');

        if ($m[1] === 'take' && $ticket->status === SupportTicket::STATUS_NEW) {
            $ticket->update(['status' => SupportTicket::STATUS_IN_PROGRESS, 'assignee' => $who, 'taken_at' => now()]);
            $telegram->answerCallback($callback['id'], 'Հայտ №'.$ticket->id.' ձերն է');
        } elseif ($m[1] === 'solve' && $ticket->status === SupportTicket::STATUS_IN_PROGRESS) {
            $ticket->update(['status' => SupportTicket::STATUS_SOLVED, 'solved_at' => now()]);
            $telegram->answerCallback($callback['id'], 'Հայտ №'.$ticket->id.' լուծված է');
        } else {
            $telegram->answerCallback($callback['id'], 'Արդեն՝ '.$ticket->statusLabel().($ticket->assignee ? ' ('.$ticket->assignee.')' : ''));
        }

        $telegram->refresh($ticket);
    }
}
