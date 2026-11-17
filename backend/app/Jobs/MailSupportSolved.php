<?php

namespace App\Jobs;

use App\Models\SupportTicket;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

/**
 * Emails the customer that their ticket was marked solved (from Telegram or
 * the admin panel without a reply).
 */
class MailSupportSolved implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [60, 300];

    public function __construct(public int $ticketId) {}

    public function handle(): void
    {
        $ticket = SupportTicket::with('customer')->find($this->ticketId);
        $customer = $ticket?->customer;
        if (! $customer?->email || $ticket->status !== SupportTicket::STATUS_SOLVED) {
            return;
        }

        $link = rtrim((string) config('services.support_portal.url'), '/').'/?ticket_id='.$ticket->id;
        $body = 'Բարև Ձեզ, '.$customer->first_name."։\n\n"
            .'Ձեր «'.($ticket->title ?: 'Հայտ №'.$ticket->id).'» հայտը լուծված է։'."\n\n"
            .'Եթե խնդիրը կրկնվի, պարզապես գրեք հայտի տակ, և այն նորից կբացվի՝ '.$link."\n\n"
            ."Flexit\n+374 33 888189";

        Mail::raw($body, function ($message) use ($customer, $ticket) {
            $message->to($customer->email, $customer->fullName())
                ->subject('Հայտ №'.$ticket->id.' · լուծված է');
        });
    }
}
