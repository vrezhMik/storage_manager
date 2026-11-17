<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One message under a ticket, from the customer or from the team.
 */
class SupportResponse extends Model
{
    public const AUTHOR_CUSTOMER = 'customer';

    public const AUTHOR_STAFF = 'staff';

    protected $fillable = ['support_ticket_id', 'author', 'author_name', 'user_id', 'body', 'attachments', 'fluent_id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['attachments' => 'array'];
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'support_ticket_id');
    }
}
