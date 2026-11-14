<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\DbEntry;
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable implements FilamentUser
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'db_entry_id',
        'allow_manual_items',
        'allow_manual_text_input',
        'can_documents_in',
        'can_documents_out',
        'can_reports',
        'can_price_check',
        'can_dashboard',
        'can_assistant',
        'can_retail',
        'retail_store',
        'partners_manager',
        'can_sales',
        'network_restricted',
        'cosign_username',
        'cosign_password',
        'mobile_id_phone',
        'nikita_phone',
        'ehdm_cashier_id',
    ];

    /**
     * Terminal sections and the column that controls each of them.
     */
    public const SECTIONS = [
        'documents_in' => 'can_documents_in',
        'documents_out' => 'can_documents_out',
        'reports' => 'can_reports',
        'price_check' => 'can_price_check',
        'dashboard' => 'can_dashboard',
        'assistant' => 'can_assistant',
        'retail' => 'can_retail',
        'sales' => 'can_sales',
    ];

    /**
     * Sections that stay hidden when their column has no value yet.
     */
    private const SECTIONS_OFF_BY_DEFAULT = ['dashboard', 'assistant', 'retail', 'sales'];

    /**
     * Sections a network_restricted user opens only from the company's network.
     */
    private const NETWORK_SECTIONS = ['retail', 'price_check'];

    protected $appends = ['sections'];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'cosign_password',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'cosign_password' => 'encrypted',
            'allow_manual_items' => 'boolean',
            'allow_manual_text_input' => 'boolean',
            'can_documents_in' => 'boolean',
            'can_documents_out' => 'boolean',
            'can_reports' => 'boolean',
            'can_price_check' => 'boolean',
            'can_dashboard' => 'boolean',
            'can_assistant' => 'boolean',
            'can_retail' => 'boolean',
            'can_sales' => 'boolean',
            'network_restricted' => 'boolean',
        ];
    }

    /**
     * @return array<string, bool> section key => whether the user may open it
     */
    public function getSectionsAttribute(): array
    {
        $sections = [];
        foreach (self::SECTIONS as $section => $column) {
            // Missing value (e.g. before the migration) falls back to the default.
            $default = ! in_array($section, self::SECTIONS_OFF_BY_DEFAULT, true);
            $sections[$section] = (bool) ($this->getAttribute($column) ?? $default);
        }

        return $sections;
    }

    public function canUseSection(string $section): bool
    {
        return $this->sections[$section] ?? false;
    }

    public function isOutsideNetwork(string $section, ?string $ip): bool
    {
        return $this->network_restricted
            && in_array($section, self::NETWORK_SECTIONS, true)
            && ! $this->dbEntry?->allowsIp($ip);
    }

    /**
     * How this user signs e-invoicing documents: the first one filled in of
     * CoSign (login + password), Mobile ID (phone), Nikita (phone); null = none.
     */
    public function signMethod(): ?string
    {
        return match (true) {
            filled($this->cosign_username) && filled($this->cosign_password) => 'cosign',
            filled($this->mobile_id_phone) => 'mobile_id',
            filled($this->nikita_phone) => 'nikita',
            default => null,
        };
    }

    public function canSignEinvoices(): bool
    {
        return $this->signMethod() !== null;
    }

    public function dbEntry(): BelongsTo
    {
        return $this->belongsTo(DbEntry::class);
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return true;
    }
}
