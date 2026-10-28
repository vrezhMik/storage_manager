<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KbSource;
use App\Services\Assistant\KnowledgeBase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AssistantController extends Controller
{
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

        return response()->json([
            'question' => $question,
            'results' => array_map(fn (array $hit) => [
                'score' => round($hit['score'], 4),
                'heading' => $hit['chunk']->heading,
                'content' => $hit['chunk']->content,
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
