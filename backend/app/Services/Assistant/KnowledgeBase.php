<?php

namespace App\Services\Assistant;

use App\Jobs\TranslateKbSource;
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
        private readonly TranslatorClient $translator,
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
                // New chunks: any earlier translation is gone.
                'translation_status' => $this->translator->enabled() ? 'pending' : null,
                'translation_error' => null,
                'translated_at' => null,
            ])->save();

            if ($this->translator->enabled()) {
                TranslateKbSource::dispatch($source->id);
            }
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
    // Longest section text returned with a hit (characters).
    private const SECTION_MAX_CHARS = 8000;

    /**
     * Best matching sections: hits from the same section are merged into one
     * result that carries the whole section text, not just the matching chunk.
     *
     * @return array<int, array{chunk: KbChunk, score: float, section: string, section_hy: string|null}>
     */
    public function search(string $question, int $limit = 6): array
    {
        $query = $this->ollama->embed([$question])[0];
        $keep = $limit * 5;
        $best = [];

        // Brute-force cosine similarity: fine for a test-sized knowledge base.
        KbChunk::query()->select(['id', 'embedding'])->orderBy('id')->chunk(500, function ($rows) use ($query, &$best, $keep) {
            foreach ($rows as $row) {
                $vector = KbChunk::unpackVector($row->embedding);
                $score = 0.0;
                foreach ($query as $i => $value) {
                    $score += $value * ($vector[$i] ?? 0.0);
                }
                $best[$row->id] = $score;
            }
            arsort($best);
            $best = array_slice($best, 0, $keep, true);
        });

        arsort($best);
        $chunks = KbChunk::with('source:id,title,type,url,file_path')->whereIn('id', array_keys($best))->get()->keyBy('id');

        // One result per section (source + heading), in score order.
        $hits = [];
        foreach ($best as $id => $score) {
            $chunk = $chunks[$id] ?? null;
            if (! $chunk) {
                continue;
            }
            $key = $chunk->kb_source_id.'|'.$chunk->heading;
            if (! isset($hits[$key])) {
                $hits[$key] = ['chunk' => $chunk, 'score' => $score];
            }
            if (count($hits) >= $limit) {
                break;
            }
        }

        return array_values(array_map(fn (array $hit) => $hit + $this->sectionText($hit['chunk']), $hits));
    }

    /**
     * All chunks of the hit's section, joined in order (centred on the hit
     * when the section is longer than SECTION_MAX_CHARS). section_hy is the
     * Armenian version where chunks were translated (null if none were).
     *
     * @return array{section: string, section_hy: string|null}
     */
    private function sectionText(KbChunk $hit): array
    {
        $parts = KbChunk::query()
            ->where('kb_source_id', $hit->kb_source_id)
            ->where('heading', $hit->heading)
            ->orderBy('position')
            ->get(['position', 'content', 'content_hy']);

        // Grow outwards from the matching chunk until the size limit.
        $index = $parts->search(fn ($p) => $p->position === $hit->position) ?: 0;
        $from = $to = $index;
        $length = mb_strlen($parts[$index]->content ?? $hit->content);
        while (true) {
            $grew = false;
            foreach ([$from - 1, $to + 1] as $next) {
                if (! isset($parts[$next]) || $length + mb_strlen($parts[$next]->content) > self::SECTION_MAX_CHARS) {
                    continue;
                }
                $length += mb_strlen($parts[$next]->content);
                if ($next < $from) {
                    $from = $next;
                } else {
                    $to = $next;
                }
                $grew = true;
            }
            if (! $grew) {
                break;
            }
        }

        $slice = $parts->slice($from, $to - $from + 1);

        return [
            'section' => $slice->pluck('content')->implode("\n"),
            'section_hy' => $slice->contains(fn ($p) => $p->content_hy !== null)
                ? $slice->map(fn ($p) => $p->content_hy ?? $p->content)->implode("\n")
                : null,
        ];
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

            $document = $this->extractor->fromHtml($response->body(), $source->url);
            $this->extractor->guardFramedPage($document, $response->body());

            return $document;
        }

        if (! $source->file_path || ! Storage::disk('kb')->exists($source->file_path)) {
            throw new RuntimeException('The uploaded file is missing');
        }

        return $this->extractor->fromFile(Storage::disk('kb')->path($source->file_path), $source->file_path);
    }

    /**
     * Splits sections into ~CHUNK_SIZE pieces at sentence/line boundaries.
     * Stored chunks do not overlap, so a section can be rebuilt by joining
     * them; the overlap (end of the previous chunk) only goes into the text
     * sent for embedding, together with the document title and heading.
     *
     * @param  array<int, array{heading: string|null, text: string}>  $sections
     * @return array<int, array{heading: string|null, content: string, embed_text: string}>
     */
    private function chunk(array $sections, ?string $title): array
    {
        $chunks = [];

        foreach ($sections as $section) {
            $pieces = [];
            foreach (preg_split('/\n+/u', $section['text']) as $paragraph) {
                // Very long paragraphs are cut by sentences.
                array_push($pieces, ...(mb_strlen($paragraph) > self::CHUNK_SIZE
                    ? preg_split('/(?<=[.!?։:;])\s+/u', $paragraph)
                    : [$paragraph]));
            }

            $buffer = [];
            $length = 0;
            $previousTail = '';
            foreach ($pieces as $piece) {
                $piece = trim($piece);
                if ($piece === '') {
                    continue;
                }
                if ($buffer !== [] && $length + mb_strlen($piece) > self::CHUNK_SIZE) {
                    $chunks[] = $this->makeChunk($title, $section['heading'], implode("\n", $buffer), $previousTail);
                    $previousTail = $this->tail($buffer);
                    $buffer = [];
                    $length = 0;
                }
                $buffer[] = $piece;
                $length += mb_strlen($piece) + 1;
            }

            if ($buffer !== []) {
                $chunks[] = $this->makeChunk($title, $section['heading'], implode("\n", $buffer), $previousTail);
            }
        }

        return $chunks;
    }

    /**
     * Last whole sentences / lines of a chunk, up to CHUNK_OVERLAP characters.
     *
     * @param  string[]  $pieces
     */
    private function tail(array $pieces): string
    {
        $tail = [];
        $length = 0;
        foreach (array_reverse($pieces) as $piece) {
            if ($length + mb_strlen($piece) > self::CHUNK_OVERLAP && $tail !== []) {
                break;
            }
            array_unshift($tail, $piece);
            $length += mb_strlen($piece);
        }

        return mb_substr(implode(' ', $tail), -self::CHUNK_OVERLAP * 2);
    }

    private function makeChunk(?string $title, ?string $heading, string $content, string $previousTail = ''): array
    {
        $content = trim($content);
        $context = implode(' — ', array_filter([$title, $heading]));

        return [
            'heading' => $heading,
            'content' => $content,
            // Image markers carry no meaning for search.
            'embed_text' => TextExtractor::stripImages(
                implode("\n", array_filter([$context, $previousTail, $content], fn ($s) => $s !== ''))
            ),
        ];
    }
}
