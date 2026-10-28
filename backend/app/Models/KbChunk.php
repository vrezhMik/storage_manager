<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KbChunk extends Model
{
    protected $fillable = [
        'kb_source_id',
        'position',
        'heading',
        'content',
        'embedding',
    ];

    protected $hidden = ['embedding'];

    public function source(): BelongsTo
    {
        return $this->belongsTo(KbSource::class, 'kb_source_id');
    }

    /**
     * @param  float[]  $vector
     */
    public static function packVector(array $vector): string
    {
        return pack('g*', ...$vector);
    }

    /**
     * @return float[]
     */
    public static function unpackVector(string $binary): array
    {
        return array_values(unpack('g*', $binary));
    }
}
