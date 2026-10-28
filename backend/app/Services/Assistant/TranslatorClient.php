<?php

namespace App\Services\Assistant;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to the local translation service (tools/translator, never leaves the server).
 */
class TranslatorClient
{
    public function enabled(): bool
    {
        return (string) config('services.translator.url') !== '';
    }

    /**
     * @param  string[]  $texts
     * @return string[]
     */
    public function translate(array $texts, string $source = 'ru', string $target = 'hy'): array
    {
        if ($texts === []) {
            return [];
        }

        $response = Http::timeout(config('services.translator.timeout', 600))
            ->acceptJson()
            ->post(rtrim(config('services.translator.url'), '/').'/translate', [
                'texts' => array_values($texts),
                'source' => $source,
                'target' => $target,
            ]);

        if ($response->failed()) {
            throw new RuntimeException('Translator failed ('.$response->status().'): '.$response->body());
        }

        $translations = $response->json('translations');
        if (! is_array($translations) || count($translations) !== count($texts)) {
            throw new RuntimeException('Translator returned an unexpected response');
        }

        return $translations;
    }

    /**
     * Rough language of a text by its letters: "ru", "hy" or null.
     */
    public static function detect(string $text): ?string
    {
        $cyrillic = preg_match_all('/\p{Cyrillic}/u', $text);
        $armenian = preg_match_all('/\p{Armenian}/u', $text);
        $letters = max(1, preg_match_all('/\p{L}/u', $text));

        if ($cyrillic / $letters >= 0.3 && $cyrillic > $armenian) {
            return 'ru';
        }

        return $armenian / $letters >= 0.3 ? 'hy' : null;
    }
}
