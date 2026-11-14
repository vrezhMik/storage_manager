<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DbEntry;
use App\Services\Catalog\WooCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * The Sales product picker: the catalog from the company's site and the
 * stock of the shown products from 1C.
 */
class CatalogController extends Controller
{
    // How long a read catalog is used before the site is read again.
    private const MAX_AGE = 6 * 3600;

    // "Refresh" in the terminal does not re-read the site more often than this.
    private const MIN_REFRESH = 300;

    private const MAX_CODES = 100;

    /**
     * {updatedAt, groups, items}, kept in a file per company so a big catalog
     * costs the site one read every few hours, not one per user.
     */
    public function index(Request $request): Response
    {
        $entry = $request->user()?->dbEntry;
        if (! $entry || blank($entry->catalog_url)) {
            return response()->json([
                'message' => 'No catalog site set up. Fill in "Catalog site" in the admin panel (DB entries).',
            ], Response::HTTP_BAD_REQUEST);
        }

        $path = storage_path('app/private/catalog/'.$entry->id.'.json');
        $age = is_file($path) ? time() - filemtime($path) : null;
        $sameSite = $age !== null && $this->sourceOf($path) === $entry->catalog_url;
        $wanted = $request->boolean('refresh') ? self::MIN_REFRESH : self::MAX_AGE;

        if ($sameSite && $age < $wanted) {
            return $this->file($path);
        }

        try {
            Cache::lock('catalog:'.$entry->id, 300)->block(120, fn () => $this->read($entry, $path));
        } catch (Throwable $e) {
            Log::warning('Catalog site could not be read', ['db_entry' => $entry->id, 'error' => $e->getMessage()]);
            if ($sameSite) {
                return $this->file($path);
            }

            return response()->json(['message' => 'The catalog site could not be read: '.$e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }

        return $this->file($path);
    }

    /**
     * ?codes=A,B,C -> 1C's answer for those products (stock, unit, classifier
     * code). Users kept inside the company network get the request to send
     * from their device (?device=1), as in Retail.
     */
    public function stock(Request $request): Response
    {
        $codes = array_values(array_unique(array_filter(array_map('trim', explode(',', (string) $request->query('codes', ''))))));
        if ($codes === [] || count($codes) > self::MAX_CODES || collect($codes)->contains(fn ($c) => mb_strlen($c) > 64)) {
            return response()->json(['message' => 'Give 1 to '.self::MAX_CODES.' product codes'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $entry = $request->user()?->dbEntry;
        if (! $entry || blank($entry->api_stock)) {
            return response()->json(['message' => 'No stock endpoint set up in the admin panel (DB entries)'], Response::HTTP_BAD_REQUEST);
        }

        $url = $entry->api_stock.(str_contains($entry->api_stock, '?') ? '&' : '?')
            .http_build_query(['Codes' => implode(',', $codes)], '', '&', PHP_QUERY_RFC3986);

        if ($request->boolean('device') && $request->user()->network_restricted) {
            return response()->json($this->deviceRequest($entry, $url))->header('Cache-Control', 'no-store');
        }

        $response = Http::withBasicAuth($entry->username, $entry->password)
            ->withHeaders(['Accept' => '*/*', 'Accept-Encoding' => 'identity'])
            ->timeout(60)
            ->withOptions(['http_errors' => false])
            ->get($url);

        if ($response->failed()) {
            return response()->json([
                'message' => 'Failed to fetch stock',
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ], Response::HTTP_BAD_GATEWAY);
        }

        return response()->json($response->json() ?? $response->body());
    }

    private function read(DbEntry $entry, string $path): void
    {
        // Another request may have read it while this one waited for the lock.
        if (is_file($path) && time() - filemtime($path) < self::MIN_REFRESH && $this->sourceOf($path) === $entry->catalog_url) {
            return;
        }

        $catalog = (new WooCatalog($entry->catalog_url))->fetch();
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0775, true);
        }
        file_put_contents($path, json_encode(
            ['updatedAt' => now()->toIso8601String(), 'source' => $entry->catalog_url] + $catalog,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ), LOCK_EX);
    }

    private function sourceOf(string $path): ?string
    {
        $head = (string) file_get_contents($path, false, null, 0, 600);

        return preg_match('/"source":"((?:[^"\\\\]|\\\\.)*)"/', $head, $m) ? json_decode('"'.$m[1].'"') : null;
    }

    private function file(string $path): Response
    {
        return response((string) file_get_contents($path), 200, [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'no-store',
        ]);
    }

    private function deviceRequest(DbEntry $entry, string $url): array
    {
        return [
            'url' => $url,
            'headers' => [
                'Authorization' => 'Basic '.base64_encode($entry->username.':'.$entry->password),
                // 1C refused Accept: application/json from devices (406); a browser's */* works.
                'Accept' => '*/*',
            ],
        ];
    }
}
