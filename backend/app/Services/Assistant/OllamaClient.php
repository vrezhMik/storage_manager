<?php

namespace App\Services\Assistant;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to the local Ollama server (never leaves our own machine).
 */
class OllamaClient
{
    /**
     * @param  string[]  $texts
     * @return array<int, float[]> one L2-normalised vector per text
     */
    public function embed(array $texts): array
    {
        if ($texts === []) {
            return [];
        }

        $response = Http::timeout(config('services.ollama.timeout', 120))
            ->acceptJson()
            ->post(rtrim(config('services.ollama.url'), '/').'/api/embed', [
                'model' => config('services.ollama.embed_model'),
                'input' => array_values($texts),
                'options' => ['num_thread' => config('services.ollama.num_thread', 2)],
            ]);

        if ($response->failed()) {
            throw new RuntimeException('Ollama embed failed ('.$response->status().'): '.$response->body());
        }

        $embeddings = $response->json('embeddings');

        if (! is_array($embeddings) || count($embeddings) !== count($texts)) {
            throw new RuntimeException('Ollama returned an unexpected embedding response');
        }

        return array_map(fn (array $vector) => self::normalize($vector), $embeddings);
    }

    /**
     * @param  float[]  $vector
     * @return float[]
     */
    public static function normalize(array $vector): array
    {
        $norm = sqrt(array_sum(array_map(fn ($v) => $v * $v, $vector)));

        return $norm > 0 ? array_map(fn ($v) => $v / $norm, $vector) : $vector;
    }
}
