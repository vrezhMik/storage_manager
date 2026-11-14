<?php

namespace App\Services\Catalog;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Reads a WooCommerce site's public Store API (no keys needed) and returns
 * the catalog in the terminal's compact shape:
 *   groups: [{id, name, parent}]
 *   items:  [{code, name, price, image, groups}]   code = the product's SKU = the 1C code
 * Pictures stay on the site; only their small size's address is kept.
 */
class WooCatalog
{
    private const PER_PAGE = 100;

    // A site with more pages than this is cut off rather than read forever.
    private const MAX_PAGES = 500;

    public function __construct(private string $baseUrl)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    public function fetch(): array
    {
        $root = $this->storeRoot();

        return [
            'groups' => array_map(fn (array $c) => [
                'id' => (int) $c['id'],
                'name' => $this->text($c['name'] ?? ''),
                'parent' => (int) ($c['parent'] ?? 0) ?: null,
            ], $this->pages($root.'/products/categories')),
            'items' => array_map(fn (array $p) => [
                'code' => trim((string) ($p['sku'] ?? '')),
                'name' => $this->text($p['name'] ?? ''),
                'price' => $this->price($p['prices'] ?? []),
                'image' => $this->smallImage($p['images'][0] ?? null),
                'imageLarge' => $this->largeImage($p['images'][0] ?? null),
                'groups' => array_map(fn ($c) => (int) $c['id'], $p['categories'] ?? []),
            ], array_filter($this->pages($root.'/products'), fn ($p) => ($p['type'] ?? 'simple') !== 'variation')),
        ];
    }

    // WooCommerce 6+ serves the Store API under /wc/store/v1, older versions under /wc/store.
    private function storeRoot(): string
    {
        foreach (['/wp-json/wc/store/v1', '/wp-json/wc/store'] as $path) {
            $res = $this->get($this->baseUrl.$path.'/products', ['per_page' => 1]);
            if ($res->successful() && is_array($res->json())) {
                return $this->baseUrl.$path;
            }
        }

        throw new RuntimeException('The site does not answer as a WooCommerce shop');
    }

    private function pages(string $url): array
    {
        $all = [];
        for ($page = 1; $page <= self::MAX_PAGES; $page++) {
            $res = $this->get($url, ['per_page' => self::PER_PAGE, 'page' => $page]);
            if (! $res->successful()) {
                throw new RuntimeException('The site answered '.$res->status().' for '.$url);
            }
            $rows = $res->json();
            if (! is_array($rows) || $rows === []) {
                break;
            }
            array_push($all, ...$rows);
            if ($page >= (int) $res->header('X-WP-TotalPages') || count($rows) < self::PER_PAGE) {
                break;
            }
        }

        return $all;
    }

    private function get(string $url, array $query)
    {
        return Http::acceptJson()->timeout(30)->withOptions(['http_errors' => false])->get($url, $query);
    }

    private function text(string $html): string
    {
        return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    // Store API prices are integers in the currency's minor unit.
    private function price(array $prices): ?float
    {
        if (! isset($prices['price']) || $prices['price'] === '') {
            return null;
        }

        return (float) $prices['price'] / (10 ** (int) ($prices['currency_minor_unit'] ?? 0));
    }

    // The smallest picture at least 150px wide from srcset, else the thumbnail.
    private function smallImage(?array $image): ?string
    {
        if (! $image) {
            return null;
        }

        $best = null;
        foreach (explode(',', (string) ($image['srcset'] ?? '')) as $candidate) {
            if (preg_match('/^\s*(\S+)\s+(\d+)w\s*$/', $candidate, $m) && (int) $m[2] >= 150 && ($best === null || (int) $m[2] < $best[1])) {
                $best = [$m[1], (int) $m[2]];
            }
        }

        return $best[0] ?? ($image['thumbnail'] ?? $image['src'] ?? null);
    }

    // For zooming in: the smallest picture at least 700px wide, else the full one.
    private function largeImage(?array $image): ?string
    {
        if (! $image) {
            return null;
        }

        $best = null;
        foreach (explode(',', (string) ($image['srcset'] ?? '')) as $candidate) {
            if (preg_match('/^\s*(\S+)\s+(\d+)w\s*$/', $candidate, $m) && (int) $m[2] >= 700 && ($best === null || (int) $m[2] < $best[1])) {
                $best = [$m[1], (int) $m[2]];
            }
        }

        return $best[0] ?? ($image['src'] ?? $image['thumbnail'] ?? null);
    }
}
