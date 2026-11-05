<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A document sent from the terminal to the tax service's e-invoicing system.
 */
class EinvoiceDocument extends Model
{
    public const TYPE_ACC_DOC_GOODS = 'ACC_DOC_GOODS';

    public const STATUS_DRAFT = 'DRAFT';

    public const STATUS_FAILED = 'FAILED';

    // Signature requested; waiting for the tax service (and for the phone
    // confirmation with Mobile ID / Nikita).
    public const STATUS_SIGNING = 'SIGNING';

    // Signed and issued: has a serial number.
    public const STATUS_ISSUED = 'ISSUED';

    protected $fillable = [
        'user_id',
        'db_entry_id',
        'type',
        'status',
        'src_id',
        'serial_no',
        'signed_at',
        'sign_request_id',
        'sign_method',
        'buyer_tin',
        'buyer_name',
        'delivered_at',
        'total',
        'items',
        'error',
        'response',
    ];

    protected function casts(): array
    {
        return [
            'items' => 'array',
            'response' => 'array',
            'delivered_at' => 'date',
            'signed_at' => 'datetime',
            'total' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
