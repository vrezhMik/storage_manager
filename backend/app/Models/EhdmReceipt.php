<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A receipt printed through the company's electronic cash register (e-ՀԴՄ).
 */
class EhdmReceipt extends Model
{
    public const TYPE_SALE = 'SALE';

    public const TYPE_RETURN = 'RETURN';

    public const STATUS_OK = 'OK';

    public const STATUS_FAILED = 'FAILED';

    protected $fillable = [
        'user_id',
        'db_entry_id',
        'return_of_id',
        'type',
        'mode',
        'status',
        'crn',
        'receipt_id',
        'fiscal',
        'sn',
        'partner_tin',
        'cash_amount',
        'card_amount',
        'total',
        'change',
        'qr',
        'printed_at',
        'items',
        'response',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'items' => 'array',
            'response' => 'array',
            'printed_at' => 'datetime',
            'cash_amount' => 'decimal:2',
            'card_amount' => 'decimal:2',
            'total' => 'decimal:2',
            'change' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function returnOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'return_of_id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(self::class, 'return_of_id');
    }
}
