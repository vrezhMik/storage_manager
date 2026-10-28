<?php

namespace App\Jobs;

use App\Models\KbSource;
use App\Services\Assistant\TextExtractor;
use App\Services\Assistant\TranslatorClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Translates the Russian chunks of a source into Armenian (stored in content_hy).
 * Slow on CPU (minutes for a big page), so it always runs in the queue.
 */
class TranslateKbSource implements ShouldQueue
{
    use Queueable;

    public int $timeout = 3600;

    public int $tries = 1;

    // Chunks sent to the translator per request.
    private const BATCH = 4;

    /**
     * @param  bool  $fresh  translate again even chunks that already have a translation
     */
    public function __construct(public int $sourceId, public bool $fresh = false) {}

    public function handle(TranslatorClient $translator): void
    {
        $source = KbSource::find($this->sourceId);
        if (! $source || ! $translator->enabled()) {
            return;
        }

        try {
            // Clear old translations before loading the chunks: a new translation
            // equal to the old one would otherwise look unchanged and not be saved.
            if ($this->fresh) {
                $source->chunks()->update(['content_hy' => null]);
            }

            $chunks = $source->chunks()->orderBy('position')->get()
                ->filter(fn ($chunk) => TranslatorClient::detect($chunk->content) === 'ru');

            if ($chunks->isEmpty()) {
                $source->forceFill(['translation_status' => 'not_needed', 'translation_error' => null])->save();

                return;
            }

            foreach ($chunks->whereNull('content_hy')->chunk(self::BATCH) as $batch) {
                // Picture lines ([[img:...]]) are kept as they are, only text is translated.
                $lines = $batch->map(fn ($chunk) => explode("\n", $chunk->content))->values();
                $texts = $lines->map(fn ($chunkLines) => implode("\n", array_filter(
                    $chunkLines,
                    fn ($line) => ! preg_match(TextExtractor::IMAGE_LINE, $line),
                )))->all();

                $translations = $translator->translate($texts);

                foreach ($batch->values() as $i => $chunk) {
                    $translated = explode("\n", $translations[$i]);
                    $out = [];
                    foreach ($lines[$i] as $line) {
                        $out[] = preg_match(TextExtractor::IMAGE_LINE, $line) ? $line : (array_shift($translated) ?? '');
                    }
                    $chunk->forceFill(['content_hy' => implode("\n", $out)])->save();
                }
            }

            $source->forceFill([
                'translation_status' => 'done',
                'translation_error' => null,
                'translated_at' => now(),
            ])->save();
        } catch (Throwable $e) {
            // Already translated chunks are kept; running it again continues.
            $source->forceFill([
                'translation_status' => 'failed',
                'translation_error' => mb_substr($e->getMessage(), 0, 2000),
            ])->save();
        }
    }
}
