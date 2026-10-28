<?php

namespace App\Services\Assistant;

use App\Models\KbChunk;
use App\Models\KbSource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/**
 * Indexes sources into chunks with embeddings and finds the chunks that
 * best match a question (works across languages, e.g. Armenian -> Russian).
 */
class KnowledgeBase
{
    // Target chunk size in characters; neighbouring chunks overlap a little
    // so a sentence cut at the border is still found.
    private const CHUNK_SIZE = 900;
    private const CHUNK_OVERLAP = 150;
    private const EMBED_BATCH = 16;

    public function __construct(
        private readonly OllamaClient $ollama,
        private readonly TextExtractor $extractor,
    ) {}

    public function index(KbSource $source): KbSource
    {
        try {
            $document = $this->extract($source);
            $chunks = $this->chunk($document['sections'], $source->title ?: $document['title']);

            if ($chunks === []) {
                throw new RuntimeException('No text found in this source');
            }

            $vectors = [];
            foreach (array_chunk($chunks, self::EMBED_BATCH) as $batch) {
                array_push($vectors, ...$this->ollama->embed(array_map(fn ($c) => $c['embed_text'], $batch)));
            }

            DB::transaction(function () use ($source, $chunks, $vectors) {
                $source->chunks()->delete();
                foreach ($chunks as $i => $chunk) {
                    $source->chunks()->create([
                        'position' => $i,
                        'heading' => $chunk['heading'] ? mb_substr($chunk['heading'], 0, 500) : null,
                        'content' => $chunk['content'],
                        'embedding' => KbChunk::packVector($vectors[$i]),
                    ]);
                }
            });

            $source->fill([
                'title' => $source->title ?: ($document['title'] ?? 'Untitled'),
                'status' => KbSource::STATUS_INDEXED,
                'error' => null,
                'chunks_count' => count($chunks),
                'indexed_at' => now(),
            ])->save();
        } catch (Throwable $e) {
            $source->fill([
                'status' => KbSource::STATUS_FAILED,
                'error' => mb_substr($e->getMessage(), 0, 2000),
            ])->save();
        }

        return $source->refresh();
    }

    /**
     * @return array<int, array{chunk: KbChunk, score: float}>
     */
    public function search(string $question, int $limit = 6): array
    {
        $query = $this->ollama->embed([$question])[0];
        $best = [];

        // Brute-force cosine similarity: fine for a test-sized knowledge base.
        KbChunk::query()->select(['id', 'embedding'])->orderBy('id')->chunk(500, function ($rows) use ($query, &$best, $limit) {
            foreach ($rows as $row) {
                $vector = KbChunk::unpackVector($row->embedding);
                $score = 0.0;
                foreach ($query as $i => $value) {
                    $score += $value * ($vector[$i] ?? 0.0);
                }
                $best[$row->id] = $score;
            }
            arsort($best);
            $best = array_slice($best, 0, $limit * 3, true);
        });

        arsort($best);
        $ids = array_slice(array_keys($best), 0, $limit);
        $chunks = KbChunk::with('source:id,title,type,url')->whereIn('id', $ids)->get()->keyBy('id');

        return array_values(array_filter(array_map(
            fn ($id) => isset($chunks[$id]) ? ['chunk' => $chunks[$id], 'score' => $best[$id]] : null,
            $ids,
        )));
    }

    /**
     * @return array{title: string|null, sections: array<int, array{heading: string|null, text: string}>}
     */
    private function extract(KbSource $source): array
    {
        if ($source->type === KbSource::TYPE_URL) {
            $response = Http::timeout(60)
                ->withHeaders(['User-Agent' => 'FlexitAssistant/1.0'])
                ->get($source->url);

            if ($response->failed()) {
                throw new RuntimeException('Cannot download the page ('.$response->status().')');
            }

            $document = $this->extractor->fromHtml($response->body());
            $this->extractor->guardFramedPage($document, $response->body());

            return $document;
        }

        if (! $source->file_path || ! Storage::disk('local')->exists($source->file_path)) {
            throw new RuntimeException('The uploaded file is missing');
        }

        return $this->extractor->fromFile(Storage::disk('local')->path($source->file_path), $source->file_path);
    }

    /**
     * Splits sections into ~CHUNK_SIZE pieces. The text sent for embedding
     * starts with the document title and section heading for context.
     *
     * @param  array<int, array{heading: string|null, text: string}>  $sections
     * @return array<int, array{heading: string|null, content: string, embed_text: string}>
     */
    private function chunk(array $sections, ?string $title): array
    {
        $chunks = [];

        foreach ($sections as $section) {
            $paragraphs = preg_split('/\n+/u', $section['text']);
            $buffer = '';

            foreach ($paragraphs as $paragraph) {
                // Very long paragraphs are cut by sentences.
                $pieces = mb_strlen($paragraph) > self::CHUNK_SIZE
                    ? preg_split('/(?<=[.!?։])\s+/u', $paragraph)
                    : [$paragraph];

                foreach ($pieces as $piece) {
                    if ($buffer !== '' && mb_strlen($buffer) + mb_strlen($piece) > self::CHUNK_SIZE) {
                        $chunks[] = $this->makeChunk($title, $section['heading'], $buffer);
                        $buffer = mb_substr($buffer, -self::CHUNK_OVERLAP);
                    }
                    $buffer = trim($buffer."\n".$piece);
                }
            }

            if (trim($buffer) !== '') {
                $chunks[] = $this->makeChunk($title, $section['heading'], $buffer);
            }
        }

        return $chunks;
    }

    private function makeChunk(?string $title, ?string $heading, string $content): array
    {
        $content = trim($content);
        $context = implode(' — ', array_filter([$title, $heading]));

        return [
            'heading' => $heading,
            'content' => $content,
            'embed_text' => $context !== '' ? $context."\n".$content : $content,
        ];
    }
}
