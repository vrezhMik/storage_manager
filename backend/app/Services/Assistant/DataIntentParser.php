<?php

namespace App\Services\Assistant;

use Carbon\Carbon;
use Throwable;

/**
 * Turns an assistant question ("who sold the most this month?") into a report
 * request with the local chat model. The model only picks the report, period
 * and sorting; the numbers always come from 1C and the terminal writes the
 * answer, so the model cannot make up figures.
 */
class DataIntentParser
{
    public const TOPICS = [
        'sales_total',
        'sales_by_manager',
        'sales_by_partner',
        'sales_by_warehouse',
        'top_items',
        'debts',
        'overdue',
        'inactive_customers',
        'customer',
        'none',
    ];

    public function __construct(private OllamaClient $ollama) {}

    public function enabled(): bool
    {
        return (string) config('services.ollama.chat_model') !== '';
    }

    /**
     * @return array{topic: string, start?: string, end?: string, order?: string, limit?: int, days?: int, partner?: string}
     */
    public function parse(string $question, ?Carbon $today = null): array
    {
        $today ??= now()->startOfDay();

        $raw = $this->ollama->chatJson((string) config('services.ollama.chat_model'), [
            ['role' => 'system', 'content' => $this->prompt($today)],
            ['role' => 'user', 'content' => $question],
        ], $this->schema());

        return $this->validate($raw, $today);
    }

    private function prompt(Carbon $today): string
    {
        $date = $today->format('Y-m-d');
        $weekday = $today->locale('en')->dayName;

        return <<<TXT
You route questions of a wholesale company's staff to one report of their 1C
accounting system. Questions are in Armenian, Russian or English.
Today is {$date} ({$weekday}).

Pick "topic":
- sales_total: how much was sold in total ("how much did we sell")
- sales_by_manager: sales per manager / sales person ("who sold the most")
- sales_by_partner: sales per customer ("which customer bought the most")
- sales_by_warehouse: sales per warehouse or shop
- top_items: best / worst selling goods
- debts: what customers owe now (receivables)
- overdue: debts past their due date
- inactive_customers: customers who stopped buying ("who has not bought for 30 days")
- customer: everything about ONE named customer (put its name in "partner")
- none: anything else, e.g. how to do something in 1C, definitions, instructions,
  error messages and codes, problems with programs or devices (cash registers,
  "ՀԴՄ", "ККМ", printers), settings
Choose a report topic ONLY when the question clearly asks for the company's
numbers (amounts, rankings, lists of customers, managers or goods). A number in
the question alone (like an error code) does not make it a report question.
When unsure, answer "none".

Other fields:
- start, end: period as YYYY-MM-DD. "this month" = first day of this month..today;
  "last month" = whole previous month; "this year" = January 1..today;
  "today", "yesterday", "this week" (from Monday), month names = that whole month
  (the last such month that is not in the future). No period mentioned: this month.
  For debts and overdue, end is the date "as of" (default today).
- order: "desc" for most / best / top, "asc" for least / worst. Default "desc".
- limit: how many rows to list, 1..50. Default 5 (10 for inactive_customers).
- days: only for inactive_customers, days without a purchase. Default 30.
- partner: only when the question names a customer; copy the name as written.
Answer with JSON only.
TXT;
    }

    /** @return array<string, mixed> */
    private function schema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'topic' => ['type' => 'string', 'enum' => self::TOPICS],
                'start' => ['type' => 'string'],
                'end' => ['type' => 'string'],
                'order' => ['type' => 'string', 'enum' => ['desc', 'asc']],
                'limit' => ['type' => 'integer'],
                'days' => ['type' => 'integer'],
                'partner' => ['type' => 'string'],
            ],
            'required' => ['topic'],
        ];
    }

    /**
     * Keeps only values the terminal can use; anything odd falls back to defaults.
     *
     * @param  array<string, mixed>  $raw
     * @return array{topic: string, start?: string, end?: string, order?: string, limit?: int, days?: int, partner?: string}
     */
    public function validate(array $raw, Carbon $today): array
    {
        $topic = in_array($raw['topic'] ?? null, self::TOPICS, true) ? $raw['topic'] : 'none';

        if ($topic === 'none') {
            return ['topic' => 'none'];
        }

        $intent = ['topic' => $topic];

        $start = $this->date($raw['start'] ?? null);
        $end = $this->date($raw['end'] ?? null);
        if ($end && $end->gt($today)) {
            $end = $today->copy();
        }
        if ($start && $end && $start->lte($end)) {
            $intent['start'] = $start->format('Y-m-d');
            $intent['end'] = $end->format('Y-m-d');
        } elseif ($end && in_array($topic, ['debts', 'overdue'], true)) {
            $intent['end'] = $end->format('Y-m-d');
        }

        if (in_array($raw['order'] ?? null, ['desc', 'asc'], true)) {
            $intent['order'] = $raw['order'];
        }

        if (is_int($raw['limit'] ?? null) && $raw['limit'] >= 1) {
            $intent['limit'] = min($raw['limit'], 50);
        }

        if ($topic === 'inactive_customers' && is_int($raw['days'] ?? null) && $raw['days'] >= 1) {
            $intent['days'] = min($raw['days'], 365);
        }

        $partner = trim((string) ($raw['partner'] ?? ''));
        if ($partner !== '' && mb_strlen($partner) <= 300) {
            $intent['partner'] = $partner;
        }

        if ($topic === 'customer' && ! isset($intent['partner'])) {
            return ['topic' => 'none'];
        }

        return $intent;
    }

    private function date(mixed $value): ?Carbon
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        try {
            $date = Carbon::createFromFormat('!Y-m-d', $value);
        } catch (Throwable) {
            return null;
        }

        return $date && $date->format('Y-m-d') === $value ? $date : null;
    }
}
