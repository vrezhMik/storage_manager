<?php

namespace App\Models;

use App\Jobs\MailSupportSolved;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/**
 * A problem registered on flexit.am: by anyone through the open form, or by a
 * signed-in customer in the support portal, where it has a conversation.
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

    public const PRIORITY_LABELS = [
        'normal' => 'Սովորական',
        'medium' => 'Միջին',
        'critical' => 'Շտապ',
    ];

    // What the forms offer; the value is shown as is.
    public const PRODUCTS = [
        '1C:Հաշվապահություն',
        '1C:Առևտրի կառավարում',
        '1C:Комплексная автоматизация / ERP',
        '1C:Աշխատավարձ և կադրեր',
        '1C:Մանրածախ',
        'Այլ / չգիտեմ',
    ];

    protected $fillable = [
        'support_customer_id',
        'status',
        'name',
        'phone',
        'company',
        'tin',
        'title',
        'product',
        'urgent',
        'priority',
        'description',
        'attachments',
        'assignee',
        'price',
        'notes',
        'source',
        'ip',
        'telegram_message_id',
        'fluent_id',
        'taken_at',
        'solved_at',
        'closed_at',
        'created_at',
        'updated_at',
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
            'closed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $ticket): void {
            $ticket->token ??= (string) Str::uuid();
        });

        // Marked solved from Telegram or the admin panel: the customer is told by email.
        static::updated(function (self $ticket): void {
            if ($ticket->wasChanged('status') && $ticket->status === self::STATUS_SOLVED && $ticket->support_customer_id) {
                MailSupportSolved::dispatch($ticket->id);
            }
        });
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(SupportCustomer::class, 'support_customer_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(SupportResponse::class)->orderBy('created_at')->orderBy('id');
    }

    public function statusLabel(): string
    {
        return self::STATUS_LABELS[$this->status] ?? $this->status;
    }

    public function isOpen(): bool
    {
        return in_array($this->status, [self::STATUS_NEW, self::STATUS_IN_PROGRESS], true);
    }

    // What customers and the team may attach: pictures, Excel, PDF, Word.
    public const ATTACHMENT_TYPES = 'jpg,jpeg,png,webp,pdf,xls,xlsx,csv,doc,docx';

    public const ATTACHMENT_MIMES = [
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'text/plain',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    // A stored file keeps its original name after "__", behind a random part.
    public static function storedName(string $original, string $extension): string
    {
        $base = preg_replace('/[^\p{L}\p{N}._-]+/u', '_', pathinfo($original, PATHINFO_FILENAME));

        return Str::random(12).'__'.(mb_substr(trim($base, '._'), 0, 80) ?: 'file').'.'.strtolower($extension);
    }

    public static function fileLabel(string $path, int $index): string
    {
        $name = basename($path);

        return str_contains($name, '__') ? substr($name, strpos($name, '__') + 2) : 'Նկար '.($index + 1);
    }

    public static function isImage(string $path): bool
    {
        return in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png', 'webp'], true);
    }

    /**
     * Attachment links for the portal: our own files through a signed link
     * that works for an hour, files brought over from Fluent Support as they were.
     */
    public static function fileLinks(?array $attachments, string $owner, int $ownerId): array
    {
        $links = [];
        foreach ($attachments ?? [] as $i => $file) {
            $links[] = is_array($file)
                ? ['name' => $file['name'] ?? 'file', 'url' => $file['url']]
                : ['name' => self::fileLabel($file, $i), 'url' => URL::temporarySignedRoute('support-portal-file', now()->addHour(), [
                    'owner' => $owner, 'id' => $ownerId, 'index' => $i,
                ])];
        }

        return $links;
    }

    public function toPortal(bool $withResponses = false): array
    {
        $data = [
            'id' => $this->id,
            'title' => $this->title ?: mb_strimwidth($this->description, 0, 80, '…'),
            'status' => $this->status,
            'statusLabel' => $this->statusLabel(),
            'priority' => $this->priority,
            'product' => $this->product,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
        if ($withResponses) {
            $data['description'] = $this->description;
            $data['files'] = self::fileLinks($this->attachments, 'ticket', $this->id);
            $data['responses'] = $this->responses->map(fn (SupportResponse $r) => [
                'id' => $r->id,
                'author' => $r->author,
                'authorName' => $r->author === SupportResponse::AUTHOR_STAFF ? ($r->author_name ?: 'Flexit') : $r->author_name,
                'body' => $r->body,
                'files' => self::fileLinks($r->attachments, 'response', $r->id),
                'createdAt' => $r->created_at?->toIso8601String(),
            ])->all();
        }

        return $data;
    }
}
