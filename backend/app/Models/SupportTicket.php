<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * A problem registered on flexit.am by anyone using 1C, our client or not.
 */
class SupportTicket extends Model
{
    public const STATUS_NEW = 'new';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_SOLVED = 'solved';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_LABELS = [
        self::STATUS_NEW => 'Նոր',
        self::STATUS_IN_PROGRESS => 'Աշխատանքի մեջ',
        self::STATUS_SOLVED => 'Լուծված',
        self::STATUS_CANCELLED => 'Չեղարկված',
    ];

    // What the form offers; the value is shown as is.
    public const PRODUCTS = [
        '1C:Հաշվապահություն',
        '1C:Առևտրի կառավարում',
        '1C:Комплексная автоматизация / ERP',
        '1C:Աշխատավարձ և կադրեր',
        '1C:Մանրածախ',
        'Այլ / չգիտեմ',
    ];

    protected $fillable = [
        'status',
        'name',
        'phone',
        'company',
        'tin',
        'product',
        'urgent',
        'description',
        'attachments',
        'assignee',
        'price',
        'notes',
        'source',
        'ip',
        'telegram_message_id',
        'taken_at',
        'solved_at',
    ];

    protected $hidden = ['token', 'ip'];

    protected function casts(): array
    {
        return [
            'urgent' => 'boolean',
            'attachments' => 'array',
            'price' => 'float',
            'taken_at' => 'datetime',
            'solved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $ticket): void {
            $ticket->token ??= (string) Str::uuid();
        });
    }

    public function statusLabel(): string
    {
        return self::STATUS_LABELS[$this->status] ?? $this->status;
    }
}
