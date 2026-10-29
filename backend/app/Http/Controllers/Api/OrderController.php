<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
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

    public function storePurchase(Request $request): Response
    {
        $user = $request->user();
        $dbEntry = $user?->dbEntry;

        if (! $dbEntry) {
            return response()->json([
                'message' => 'No DB config assigned to this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        if (! $dbEntry->api_post_purchases) {
            return response()->json([
                'message' => 'No POST purchases endpoint configured for this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        $validated = $request->validate([
            'Number' => ['required', 'string'],
            'ClientID' => ['nullable', 'string'],
            'Items' => ['required', 'array', 'min:1'],
            'Items.*.ItemID' => ['required', 'string'],
            'Items.*.Quantity' => ['required', 'numeric'],
        ]);

        $response = Http::withBasicAuth($dbEntry->username, $dbEntry->password)
            ->acceptJson()
            ->asJson()
            ->withHeaders(['Accept-Encoding' => 'identity'])
            ->withOptions(['http_errors' => false])
            ->post($dbEntry->api_post_purchases, $validated);

        if ($response->failed()) {
            return response()->json([
                'message' => 'Failed to post purchase',
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ], Response::HTTP_BAD_GATEWAY);
        }

        $status = $response->status();
        $data = $response->json();

        if ($data === null) {
            return response()->json($response->body(), $status);
        }

        return response()->json($data, $status);
    }

    public function store(Request $request): Response
    {
        $user = $request->user();
        $dbEntry = $user?->dbEntry;

        if (! $dbEntry) {
            return response()->json([
                'message' => 'No DB config assigned to this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        if (! $dbEntry->api_post_orders) {
            return response()->json([
                'message' => 'No POST orders endpoint configured for this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        $validated = $request->validate([
            'Number' => ['required', 'string'],
            'ClientID' => ['nullable', 'string'],
            'Items' => ['required', 'array', 'min:1'],
            'Items.*.ItemID' => ['required', 'string'],
            'Items.*.Quantity' => ['required', 'numeric'],
        ]);

        $response = Http::withBasicAuth($dbEntry->username, $dbEntry->password)
            ->acceptJson()
            ->asJson()
            ->withHeaders(['Accept-Encoding' => 'identity'])
            ->withOptions(['http_errors' => false])
            ->post($dbEntry->api_post_orders, $validated);

        if ($response->failed()) {
            return response()->json([
                'message' => 'Failed to post order',
                'status' => $response->status(),
                'body' => $response->json() ?? $response->body(),
            ], Response::HTTP_BAD_GATEWAY);
        }

        $status = $response->status();
        $data = $response->json();

        if ($data === null) {
            return response()->json($response->body(), $status);
        }

        return response()->json($data, $status);
    }

    public function priceCheck(Request $request): Response
    {
        $barcode = trim((string) $request->query('barcode', ''));

        if ($barcode === '' || mb_strlen($barcode) > 255) {
            return response()->json([
                'message' => 'Barcode is required',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $endpoint = $request->user()?->dbEntry?->api_price_check;

        // URL saved like ".../GET_ORDER?Barcode=" -> the barcode is appended to the end as is.
        if ($endpoint && str_ends_with($endpoint, '=')) {
            $dbEntry = $request->user()->dbEntry;

            $response = Http::withBasicAuth($dbEntry->username, $dbEntry->password)
                ->acceptJson()
                ->withHeaders(['Accept-Encoding' => 'identity'])
                ->withOptions(['http_errors' => false])
                ->get($endpoint.rawurlencode($barcode));

            if ($response->failed()) {
                return response()->json([
                    'message' => 'Failed to fetch price check',
                    'status' => $response->status(),
                    'body' => $response->json() ?? $response->body(),
                ], Response::HTTP_BAD_GATEWAY);
            }

            $data = $response->json();

            return response()->json($data ?? $response->body(), $response->status());
        }

        return $this->proxy($request, 'price check', ['Barcode' => $barcode]);
    }

    public function sales(Request $request): Response
    {
        return $this->dateRangeReport($request, 'sales');
    }

    public function salesByWarehouse(Request $request): Response
    {
        return $this->dateRangeReport($request, 'sales by warehouse');
    }

    public function debts(Request $request): Response
    {
        return $this->dateRangeReport($request, 'debts');
    }

    public function abc(Request $request): Response
    {
        return $this->dateRangeReport($request, 'abc');
    }

    /**
     * Optional ?group=manager|partner|item -> GroupBy=Manager|Partner|Item for 1C.
     * ?group=partner-item&partner=NAME -> GroupBy=PartnerItem&Partner=NAME: the
     * items one customer bought (customer card).
     */
    public function salesMonthly(Request $request): Response
    {
        $groups = ['manager' => 'Manager', 'partner' => 'Partner', 'item' => 'Item', 'partner-item' => 'PartnerItem'];
        $group = (string) $request->query('group', '');

        if ($group !== '' && ! isset($groups[$group])) {
            return response()->json([
                'message' => 'Invalid group, expected manager, partner, item or partner-item',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $extra = $group === '' ? [] : ['GroupBy' => $groups[$group]];

        if ($group === 'partner-item') {
            $partner = trim((string) $request->query('partner', ''));
            if ($partner === '' || mb_strlen($partner) > 300) {
                return response()->json([
                    'message' => 'partner is required for partner-item (up to 300 characters)',
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }
            $extra['Partner'] = $partner;
        }

        return $this->dateRangeReport($request, 'sales monthly', $extra);
    }

    /**
     * ?date=YYYY-MM-DD (optional, defaults to today) -> Date=DD.MM.YYYY for 1C.
     */
    public function overdueDebts(Request $request): Response
    {
        $date = $this->optionalDate($request);
        if ($date instanceof Response) {
            return $date;
        }

        return $this->proxy($request, 'overdue debts', ['Date' => $date->format('d.m.Y')]);
    }

    /**
     * ?date=YYYY-MM-DD (optional, defaults to today) -> Date=DD.MM.YYYY for 1C.
     */
    public function dashboard(Request $request): Response
    {
        $date = $this->optionalDate($request);
        if ($date instanceof Response) {
            return $date;
        }

        return $this->proxy($request, 'dashboard', ['Date' => $date->format('d.m.Y')]);
    }

    /**
     * ?date=YYYY-MM-DD (optional) &days=N (1..3650, default 60) -> Date / Days for 1C.
     */
    public function frozenStock(Request $request): Response
    {
        $date = $this->optionalDate($request);
        if ($date instanceof Response) {
            return $date;
        }

        $days = filter_var($request->query('days', 60), FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 3650],
        ]);

        if ($days === false) {
            return response()->json([
                'message' => 'Invalid days, expected a number from 1 to 3650',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->proxy($request, 'frozen stock', [
            'Date' => $date->format('d.m.Y'),
            'Days' => $days,
        ]);
    }

    /**
     * Parses the optional ?date=YYYY-MM-DD (today when missing), or returns a 422 response.
     */
    private function optionalDate(Request $request): Carbon|Response
    {
        $raw = (string) $request->query('date', '');

        if ($raw === '') {
            return now()->startOfDay();
        }

        try {
            $parsed = Carbon::createFromFormat('!Y-m-d', $raw);
        } catch (\Throwable) {
            $parsed = false;
        }

        if (! $parsed || $parsed->format('Y-m-d') !== $raw) {
            return response()->json([
                'message' => 'Invalid date, expected YYYY-MM-DD',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $parsed;
    }

    /**
     * Reports that take ?start=YYYY-MM-DD&end=YYYY-MM-DD and pass them to 1C
     * as Datestart / Date in DD.MM.YYYY.
     */
    private function dateRangeReport(Request $request, string $type, array $extraQuery = []): Response
    {
        $dates = [];

        foreach (['start' => 'Datestart', 'end' => 'Date'] as $param => $key) {
            $raw = (string) $request->query($param, '');

            try {
                $date = Carbon::createFromFormat('!Y-m-d', $raw);
            } catch (\Throwable) {
                $date = false;
            }

            if (! $date || $date->format('Y-m-d') !== $raw) {
                return response()->json([
                    'message' => 'Invalid '.$param.' date, expected YYYY-MM-DD',
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }

            $dates[$key] = $date;
        }

        if ($dates['Datestart']->gt($dates['Date'])) {
            return response()->json([
                'message' => 'Start date must not be after end date',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return $this->proxy($request, $type, [
            'Datestart' => $dates['Datestart']->format('d.m.Y'),
            'Date' => $dates['Date']->format('d.m.Y'),
        ] + $extraQuery);
    }

    private function proxy(Request $request, string $type, ?array $query = null): Response
    {
        $user = $request->user();
        $dbEntry = $user?->dbEntry;

        if (! $dbEntry) {
            return response()->json([
                'message' => 'No DB config assigned to this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        $endpoint = match ($type) {
            'purchases' => $dbEntry->api_get_purchase,
            'price check' => $dbEntry->api_price_check,
            'sales' => $dbEntry->api_sales,
            'sales by warehouse' => $dbEntry->api_sales_by_warehouse,
            'debts' => $dbEntry->api_debts,
            'dashboard' => $dbEntry->api_dashboard,
            'frozen stock' => $dbEntry->api_frozen_stock,
            'abc' => $dbEntry->api_abc,
            'overdue debts' => $dbEntry->api_overdue_debts,
            'sales monthly' => $dbEntry->api_sales_monthly,
            default => $dbEntry->api_get_orders,
        };

        if (! $endpoint) {
            return response()->json([
                'message' => 'No '.$type.' endpoint configured for this user',
            ], Response::HTTP_BAD_REQUEST);
        }

        $query ??= $request->query();

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
