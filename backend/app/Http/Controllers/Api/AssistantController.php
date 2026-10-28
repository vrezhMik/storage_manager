<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KbSource;
use App\Services\Assistant\KnowledgeBase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AssistantController extends Controller
{
    /**
     * A picture referenced from a source's text ([[img:path]]), relative to
     * the folder of the source file. ?path=image246.png
     */
    public function image(Request $request, KbSource $source): Response
    {
        $relative = str_replace('\\', '/', (string) $request->query('path', ''));

        if ($source->type !== KbSource::TYPE_FILE
            || ! $source->file_path
            || $relative === ''
            || str_contains($relative, '..')
            || str_starts_with($relative, '/')
            || ! preg_match('/\.(png|jpe?g|gif|webp|svg)$/i', $relative)) {
            abort(404);
        }

        $path = trim(dirname($source->file_path), '/').'/'.$relative;
        $disk = Storage::disk('kb');

        if (! $disk->exists($path)) {
            abort(404);
        }

        return response()->file($disk->path($path), [
            'Cache-Control' => 'private, max-age=86400',
            // SVG files could carry scripts; never run them.
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function search(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $question = trim((string) $request->input('question', ''));

        if (mb_strlen($question) < 3 || mb_strlen($question) > 1000) {
            return response()->json([
                'message' => 'Question must be 3 to 1000 characters long',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! KbSource::query()->where('status', KbSource::STATUS_INDEXED)->exists()) {
            return response()->json(['question' => $question, 'results' => []]);
        }

        try {
            $results = $knowledgeBase->search($question);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'The AI service is not available right now',
            ], Response::HTTP_SERVICE_UNAVAILABLE);
        }

        $minScore = (float) config('services.assistant.min_score', 0.5);

        return response()->json([
            'question' => $question,
            'min_score' => $minScore,
            'results' => array_map(fn (array $hit) => [
                'score' => round($hit['score'], 4),
                'relevant' => $hit['score'] >= $minScore,
                'heading' => $hit['chunk']->heading,
                'content' => $hit['chunk']->content,
                'content_hy' => $hit['chunk']->content_hy,
                'section' => $hit['section'],
                'section_hy' => $hit['section_hy'],
                'source' => [
                    'id' => $hit['chunk']->source->id,
                    'title' => $hit['chunk']->source->title,
                    'type' => $hit['chunk']->source->type,
                    'url' => $hit['chunk']->source->type === KbSource::TYPE_URL ? $hit['chunk']->source->url : null,
                ],
            ], $results),
        ]);
    }
}
