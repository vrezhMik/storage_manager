<?php

namespace App\Services\Support;

use App\Models\SupportCustomer;
use App\Models\SupportResponse;
use App\Models\SupportTicket;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Brings Fluent Support's customers, tickets and replies (exported from
 * flexit.am as JSON) into the portal, and the customers' WordPress password
 * hashes (exported from wp_users) so they keep their password. Running it
 * again updates what was brought over before instead of doubling it.
 */
class FluentImport
{
    private const STATUS = ['new' => SupportTicket::STATUS_NEW, 'active' => SupportTicket::STATUS_IN_PROGRESS, 'closed' => SupportTicket::STATUS_SOLVED];

    /**
     * @param  array  $export  {customers: [...], tickets: [... with responses]}
     * @param  array<string,string>  $passwords  email => WordPress hash
     * @return array{customers:int,tickets:int,responses:int,passwords:int}
     */
    public function run(array $export, array $passwords = []): array
    {
        $counts = ['customers' => 0, 'tickets' => 0, 'responses' => 0, 'passwords' => 0];
        $passwords = array_change_key_case($passwords, CASE_LOWER);

        DB::transaction(function () use ($export, $passwords, &$counts) {
            $customers = [];
            foreach ($export['customers'] ?? [] as $c) {
                $email = mb_strtolower(trim((string) ($c['email'] ?? '')));
                if ($email === '') {
                    continue;
                }
                $customer = SupportCustomer::where('fluent_id', $c['id'])->first() ?? SupportCustomer::firstOrNew(['email' => $email]);
                $customer->fill([
                    'first_name' => trim((string) ($c['first_name'] ?? '')) ?: $email,
                    'last_name' => $c['last_name'] ?? null,
                    'email' => $email,
                    'fluent_id' => $c['id'],
                ]);
                if (! $customer->password && isset($passwords[$email])) {
                    $customer->legacy_password = $passwords[$email];
                    $counts['passwords']++;
                }
                if (! $customer->exists && ! empty($c['created_at'])) {
                    $customer->created_at = Carbon::parse($c['created_at']);
                }
                $customer->save();
                $customers[(string) $c['id']] = $customer;
                $counts['customers']++;
            }

            foreach ($export['tickets'] ?? [] as $t) {
                $customer = $customers[(string) ($t['customer_id'] ?? '')] ?? null;
                $ticket = SupportTicket::firstOrNew(['fluent_id' => $t['id']]);
                $created = ! empty($t['created_at']) ? Carbon::parse($t['created_at']) : now();
                $ticket->fill([
                    'support_customer_id' => $customer?->id,
                    'status' => self::STATUS[$t['status'] ?? ''] ?? SupportTicket::STATUS_NEW,
                    'name' => $customer?->fullName() ?: 'Fluent Support',
                    'phone' => '—',
                    'title' => mb_strimwidth(trim((string) ($t['title'] ?? '')), 0, 190) ?: null,
                    'product' => 'Այլ / չգիտեմ',
                    'priority' => in_array($t['client_priority'] ?? null, ['normal', 'medium', 'critical'], true) ? $t['client_priority'] : 'normal',
                    'urgent' => ($t['client_priority'] ?? null) === 'critical',
                    'description' => self::text($t['content'] ?? '') ?: '—',
                    'attachments' => self::links($t['attachments'] ?? []),
                    'source' => 'fluent',
                    'solved_at' => ! empty($t['resolved_at']) ? Carbon::parse($t['resolved_at']) : null,
                    'created_at' => $created,
                    'updated_at' => ! empty($t['updated_at']) ? Carbon::parse($t['updated_at']) : $created,
                ]);
                $ticket->timestamps = false;
                $ticket->save();
                $counts['tickets']++;

                foreach ($t['responses'] ?? [] as $r) {
                    $staff = in_array($r['person_type'] ?? data_get($r, 'person.person_type'), ['agent', 'admin'], true);
                    $response = SupportResponse::firstOrNew(['fluent_id' => $r['id']]);
                    $at = ! empty($r['created_at']) ? Carbon::parse($r['created_at']) : $created;
                    $response->fill([
                        'support_ticket_id' => $ticket->id,
                        'author' => $staff ? SupportResponse::AUTHOR_STAFF : SupportResponse::AUTHOR_CUSTOMER,
                        'author_name' => data_get($r, 'person.full_name') ?: trim(data_get($r, 'person.first_name', '').' '.data_get($r, 'person.last_name', '')) ?: null,
                        'body' => self::text($r['content'] ?? '') ?: '—',
                        'attachments' => self::links($r['attachments'] ?? []),
                        'created_at' => $at,
                        'updated_at' => $at,
                    ]);
                    $response->timestamps = false;
                    $response->save();
                    $counts['responses']++;
                }
            }
        });

        return $counts;
    }

    /**
     * wp_users exported from phpMyAdmin as CSV with a header row: the columns
     * user_email and user_pass are used, the rest ignored.
     *
     * @return array<string,string>
     */
    public static function passwordsFromCsv(string $csv): array
    {
        $rows = array_map(fn ($line) => str_getcsv($line, ',', '"', '\\'), preg_split('/\r\n|\n|\r/', trim($csv)));
        $head = array_map(fn ($h) => strtolower(trim((string) $h, " \"\u{FEFF}")), array_shift($rows) ?? []);
        $email = array_search('user_email', $head, true);
        $pass = array_search('user_pass', $head, true);
        if ($email === false || $pass === false) {
            return [];
        }

        $out = [];
        foreach ($rows as $row) {
            if (! empty($row[$email]) && ! empty($row[$pass])) {
                $out[mb_strtolower(trim($row[$email]))] = trim($row[$pass]);
            }
        }

        return $out;
    }

    // Fluent Support keeps HTML; the portal shows plain text with line breaks.
    public static function text(string $html): string
    {
        $html = preg_replace('#<(br|/p|/div|/li|/h[1-6])\s*/?>#i', "\n", $html);
        $html = preg_replace('#<li[^>]*>#i', '• ', $html);
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace("/[ \t]+/u", ' ', $text);

        return trim(preg_replace("/\n\s*\n\s*\n+/u", "\n\n", $text));
    }

    private static function links(array $attachments): ?array
    {
        $links = [];
        foreach ($attachments as $a) {
            $url = $a['full_url'] ?? $a['url'] ?? $a['file_url'] ?? null;
            if ($url) {
                $links[] = ['name' => $a['title'] ?? $a['name'] ?? 'file', 'url' => $url];
            }
        }

        return $links ?: null;
    }
}
