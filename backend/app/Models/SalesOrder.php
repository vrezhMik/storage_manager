<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A sale made in the terminal: a draft until it is sent to 1C, where it
 * becomes a customer order (Заказ клиента).
 */
class SalesOrder extends Model
{
    public const STATUS_DRAFT = 'DRAFT';

    // 1C refused it or could not be reached; it can be changed and sent again.
    public const STATUS_FAILED = 'FAILED';

    // In 1C, with 1C's number; it can no longer be changed in the terminal.
    public const STATUS_SENT = 'SENT';

    protected $fillable = [
        'user_id',
        'db_entry_id',
        'status',
        'buyer_tin',
        'buyer_name',
        'buyer_address',
        'delivered_at',
        'comment',
        'items',
        'total',
        'onec_number',
        'onec_ref',
        'error',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'items' => 'array',
            'delivered_at' => 'date',
            'total' => 'float',
            'sent_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function dbEntry(): BelongsTo
    {
        return $this->belongsTo(DbEntry::class);
    }

    /**
     * What 1C receives: the buyer by TIN (name and address for a new one) and
     * the goods by 1C code.
     */
    public function toOneC(): array
    {
        return [
            'TerminalID' => $this->id,
            'Date' => ($this->delivered_at ?? $this->created_at)?->format('Y-m-d'),
            'BuyerTIN' => $this->buyer_tin,
            'BuyerName' => $this->buyer_name,
            'BuyerAddress' => $this->buyer_address,
            'Comment' => $this->comment,
            'Manager' => $this->user?->partners_manager,
            'Items' => array_map(fn (array $i) => [
                'Code' => $i['code'],
                'Quantity' => (float) $i['quantity'],
                'Price' => (float) $i['price'],
            ], $this->items ?? []),
        ];
    }

    public function toTerminal(): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'buyerTin' => $this->buyer_tin,
            'buyerName' => $this->buyer_name,
            'buyerAddress' => $this->buyer_address,
            'deliveredAt' => $this->delivered_at?->format('Y-m-d'),
            'comment' => $this->comment,
            'items' => $this->items ?? [],
            'total' => (float) $this->total,
            'onecNumber' => $this->onec_number,
            'error' => $this->error,
            'user' => $this->user?->name,
            'sentAt' => $this->sent_at?->toIso8601String(),
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
