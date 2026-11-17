<?php

namespace App\Jobs;

use App\Models\SupportResponse;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

/**
 * Emails the customer that the team answered their ticket, as Fluent Support did.
 */
class MailSupportReply implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [60, 300];

    public function __construct(public int $responseId) {}

    public function handle(): void
    {
        $response = SupportResponse::with('ticket.customer')->find($this->responseId);
        $customer = $response?->ticket?->customer;
        if (! $customer?->email) {
            return;
        }

        $ticket = $response->ticket;
        $link = rtrim((string) config('services.support_portal.url'), '/').'/?ticket_id='.$ticket->id;
        $body = 'Բարև Ձեզ, '.$customer->first_name."։\n\n"
            .'Ձեր «'.($ticket->title ?: 'Հայտ №'.$ticket->id).'» հայտին պատասխանել են.'."\n\n"
            .$response->body."\n\n"
            .'Պատասխանելու կամ պատմությունը տեսնելու համար՝ '.$link."\n\n"
            ."Flexit\n+374 33 888189";

        Mail::raw($body, function ($message) use ($customer, $ticket) {
            $message->to($customer->email, $customer->fullName())
                ->subject('Հայտ №'.$ticket->id.' · նոր պատասխան Flexit-ից');
        });
    }
}
