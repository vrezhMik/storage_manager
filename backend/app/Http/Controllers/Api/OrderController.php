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
        $user = $request->user();
        $dbEntry = $user?->dbEntry;

        if (! $dbEntry) {
            return response()->json([
                'message' => 'No DB config assigned to this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        $query = $request->query();

        $storedQuery = [];
        $baseUrl = $dbEntry->api_get_orders;

        $parts = parse_url($dbEntry->api_get_orders);
        if ($parts !== false) {
            $baseUrl = ($parts['scheme'] ?? '')
                ? ($parts['scheme'] . '://' . ($parts['host'] ?? '') . ($parts['port'] ?? '' ? ':' . $parts['port'] : '') . ($parts['path'] ?? ''))
                : ($parts['path'] ?? $dbEntry->api_get_orders);

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
                'message' => 'Failed to fetch orders',
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
