<?php

namespace App\Models;

use App\Support\WordPressPassword;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Someone who signs in to the support portal on flexit.am.
 */
class SupportCustomer extends Model
{
    // How long a portal sign-in lasts without being used.
    public const TOKEN_DAYS = 30;

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'company',
        'tin',
        'contract',
        'active',
        'password',
        'legacy_password',
        'fluent_id',
        'last_login_at',
    ];

    protected $hidden = ['password', 'legacy_password'];

    protected function casts(): array
    {
        return [
            'contract' => 'boolean',
            'active' => 'boolean',
            'password' => 'hashed',
            'last_login_at' => 'datetime',
        ];
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class);
    }

    public function fullName(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }

    /**
     * Checks the password; a WordPress hash brought over from Fluent Support
     * is accepted once and replaced with our own.
     */
    public function checkPassword(string $password): bool
    {
        if ($this->password && Hash::check($password, $this->password)) {
            return true;
        }
        if ($this->legacy_password && WordPressPassword::check($password, $this->legacy_password)) {
            $this->forceFill(['password' => $password, 'legacy_password' => null])->save();

            return true;
        }

        return false;
    }

    // A new sign-in: the plain token goes to the browser, its hash stays here.
    public function issueToken(): string
    {
        $plain = Str::random(48);
        SupportCustomerToken::create([
            'support_customer_id' => $this->id,
            'token' => hash('sha256', $plain),
            'expires_at' => now()->addDays(self::TOKEN_DAYS),
        ]);
        $this->forceFill(['last_login_at' => now()])->save();

        return $plain;
    }

    public function toPortal(): array
    {
        return [
            'id' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'contract' => $this->contract,
        ];
    }
}
