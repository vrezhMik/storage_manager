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
    ];

    /**
     * Sections that stay hidden when their column has no value yet.
     */
    private const SECTIONS_OFF_BY_DEFAULT = ['dashboard'];

    protected $appends = ['sections'];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
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
            'allow_manual_items' => 'boolean',
            'allow_manual_text_input' => 'boolean',
            'can_documents_in' => 'boolean',
            'can_documents_out' => 'boolean',
            'can_reports' => 'boolean',
            'can_price_check' => 'boolean',
            'can_dashboard' => 'boolean',
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

    public function dbEntry(): BelongsTo
    {
        return $this->belongsTo(DbEntry::class);
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return true;
    }
}
