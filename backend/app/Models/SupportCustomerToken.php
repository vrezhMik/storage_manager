<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportCustomerToken extends Model
{
    protected $fillable = ['support_customer_id', 'token', 'expires_at', 'last_used_at'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'last_used_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(SupportCustomer::class, 'support_customer_id');
    }
}
