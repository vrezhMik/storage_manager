<?php

namespace App\Jobs;

use App\Models\KbSource;
use App\Services\Assistant\KnowledgeBase;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Indexes one knowledge-base source in the background (bulk uploads).
 */
class IndexKbSource implements ShouldQueue
{
    use Queueable;

    public int $timeout = 900;

    public int $tries = 1;

    public function __construct(public int $sourceId) {}

    public function handle(KnowledgeBase $knowledgeBase): void
    {
        $source = KbSource::find($this->sourceId);

        if ($source) {
            $knowledgeBase->index($source);
        }
    }
}
