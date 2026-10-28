<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KbSource extends Model
{
    public const TYPE_URL = 'url';
    public const TYPE_FILE = 'file';

    public const STATUS_PENDING = 'pending';
    public const STATUS_INDEXED = 'indexed';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'title',
        'type',
        'url',
        'file_path',
        'status',
        'error',
        'chunks_count',
        'indexed_at',
    ];

    protected function casts(): array
    {
        return [
            'indexed_at' => 'datetime',
        ];
    }

    public function chunks(): HasMany
    {
        return $this->hasMany(KbChunk::class);
    }
}
