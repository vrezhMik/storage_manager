<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class OrderController extends Controller
{
    public function index(Request $request): Response
    {
        return $this->proxy($request, 'orders');
    }

    public function purchases(Request $request): Response
    {
        return $this->proxy($request, 'purchases');
    }

    private function proxy(Request $request, string $type): Response
    {
        $user = $request->user();
        $dbEntry = $user?->dbEntry;

        if (! $dbEntry) {
            return response()->json([
                'message' => 'No DB config assigned to this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        $endpoint = $type === 'purchases' ? $dbEntry->api_get_purchase : $dbEntry->api_get_orders;

        $query = $request->query();

        $storedQuery = [];
        $baseUrl = $endpoint;

        $parts = parse_url($endpoint);
        if ($parts !== false) {
            $baseUrl = ($parts['scheme'] ?? '')
                ? ($parts['scheme'] . '://' . ($parts['host'] ?? '') . ($parts['port'] ?? '' ? ':' . $parts['port'] : '') . ($parts['path'] ?? ''))
                : ($parts['path'] ?? $endpoint);

            if (! empty($parts['query'])) {
                parse_str($parts['query'], $storedQuery);
            }
        }

        $mergedQuery = array_merge($storedQuery, $query);

        $response = Http::withBasicAuth($dbEntry->username, $dbEntry->password)
            ->acceptJson()
            ->withHeaders(['Accept-Encoding' => 'identity'])
            ->withOptions(['http_errors' => false])
            ->get($baseUrl, $mergedQuery);

        if ($response->failed()) {
            return response()->json([
                'message' => 'Failed to fetch '.$type,
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ], Response::HTTP_BAD_GATEWAY);
        }

        $status = $response->status();
        $data = $response->json();

        if ($data === null) {
            // Fallback: return raw body but force JSON content type so the UI parses it.
            return response()->json($response->body(), $status);
        }

        return response()->json($data, $status);
    }
}
