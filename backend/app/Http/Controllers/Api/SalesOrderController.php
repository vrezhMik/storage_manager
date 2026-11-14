<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SalesOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Sales made in the terminal ("Պահպանել") and sent to 1C as customer orders
 * ("Ուղարկել 1C"). Each user sees their own.
 */
class SalesOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'orders' => SalesOrder::with('user')
                ->where('db_entry_id', $user->db_entry_id)
                ->where('user_id', $user->id)
                ->latest()
                ->limit(200)
                ->get()
                ->map->toTerminal(),
        ]);
    }

    public function show(Request $request, SalesOrder $order): JsonResponse
    {
        $this->own($request, $order);

        return response()->json($order->load('user')->toTerminal());
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->db_entry_id) {
            return response()->json(['message' => 'No DB config assigned to this user'], Response::HTTP_BAD_REQUEST);
        }

        $order = SalesOrder::create($this->validated($request) + [
            'user_id' => $user->id,
            'db_entry_id' => $user->db_entry_id,
            'status' => SalesOrder::STATUS_DRAFT,
        ]);

        return response()->json($order->load('user')->toTerminal(), Response::HTTP_CREATED);
    }

    public function update(Request $request, SalesOrder $order): JsonResponse
    {
        $this->own($request, $order);
        if ($order->status === SalesOrder::STATUS_SENT) {
            return response()->json(['message' => 'This sale is already in 1C'], Response::HTTP_CONFLICT);
        }

        $order->update($this->validated($request) + ['status' => SalesOrder::STATUS_DRAFT, 'error' => null]);

        return response()->json($order->load('user')->toTerminal());
    }

    public function destroy(Request $request, SalesOrder $order): JsonResponse
    {
        $this->own($request, $order);
        if ($order->status === SalesOrder::STATUS_SENT) {
            return response()->json(['message' => 'This sale is already in 1C'], Response::HTTP_CONFLICT);
        }
        $order->delete();

        return response()->json(['deleted' => true]);
    }

    /**
     * Creates the customer order in 1C. Users kept inside the company network
     * (?device=1) get the request to send from their device and report 1C's
     * answer to deviceResult().
     */
    public function send(Request $request, SalesOrder $order): JsonResponse
    {
        $this->own($request, $order);
        if ($order->status === SalesOrder::STATUS_SENT) {
            return response()->json($order->load('user')->toTerminal());
        }

        $entry = $order->dbEntry;
        if (! $entry || blank($entry->api_sales_order)) {
            return response()->json(['message' => 'No 1C sales order endpoint set up in the admin panel (DB entries)'], Response::HTTP_BAD_REQUEST);
        }

        $body = json_encode($order->load('user')->toOneC(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($request->boolean('device') && $request->user()->network_restricted) {
            return response()->json(['device' => [
                'url' => $entry->api_sales_order,
                'method' => 'POST',
                'headers' => [
                    'Authorization' => 'Basic '.base64_encode($entry->username.':'.$entry->password),
                    'Content-Type' => 'application/json; charset=utf-8',
                    'Accept' => '*/*',
                ],
                'body' => $body,
            ]])->header('Cache-Control', 'no-store');
        }

        try {
            $response = Http::withBasicAuth($entry->username, $entry->password)
                ->withHeaders(['Accept' => '*/*', 'Accept-Encoding' => 'identity'])
                ->withBody($body, 'application/json; charset=utf-8')
                ->timeout(60)
                ->withOptions(['http_errors' => false])
                ->post($entry->api_sales_order);
        } catch (Throwable $e) {
            return $this->record($order, false, null, null, '1C could not be reached: '.$e->getMessage());
        }

        return $this->record($order, $response->successful(), $response->json(), $response->status(), $response->body());
    }

    /**
     * {status, body} of 1C's answer to the request the device sent.
     */
    public function deviceResult(Request $request, SalesOrder $order): JsonResponse
    {
        $this->own($request, $order);
        $data = $request->validate([
            'status' => ['nullable', 'integer'],
            'body' => ['nullable', 'string'],
            'error' => ['nullable', 'string', 'max:2000'],
        ]);

        if (isset($data['error'])) {
            return $this->record($order, false, null, null, $data['error']);
        }
        $status = (int) ($data['status'] ?? 0);

        return $this->record($order, $status >= 200 && $status < 300, json_decode((string) ($data['body'] ?? ''), true), $status, (string) ($data['body'] ?? ''));
    }

    // 1C answers {"Number": "...", "Ref": "..."} or {"Error": "..."}.
    private function record(SalesOrder $order, bool $ok, mixed $json, ?int $status, string $raw): JsonResponse
    {
        $json = is_array($json) ? $json : [];
        $number = $json['Number'] ?? $json['Номер'] ?? null;

        if ($ok && $number !== null && blank($json['Error'] ?? null)) {
            $order->update([
                'status' => SalesOrder::STATUS_SENT,
                'onec_number' => (string) $number,
                'onec_ref' => isset($json['Ref']) ? (string) $json['Ref'] : null,
                'error' => null,
                'sent_at' => now(),
            ]);
        } else {
            $message = $json['Error'] ?? $json['Ошибка'] ?? ($status ? '1C answered '.$status.': ' : '').mb_substr(strip_tags($raw), 0, 500);
            $order->update(['status' => SalesOrder::STATUS_FAILED, 'error' => (string) $message]);
        }

        return response()->json($order->load('user')->toTerminal(), $order->status === SalesOrder::STATUS_SENT ? 200 : Response::HTTP_BAD_GATEWAY);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'buyerTin' => ['nullable', 'regex:/^\d{8}$/'],
            'buyerName' => ['required', 'string', 'max:255'],
            'buyerAddress' => ['nullable', 'string', 'max:255'],
            'deliveredAt' => ['nullable', 'date'],
            'comment' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.code' => ['required', 'string', 'max:64'],
            'items.*.name' => ['required', 'string', 'max:500'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.classifierCode' => ['nullable', 'string', 'max:20'],
            'items.*.image' => ['nullable', 'string', 'max:1000'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
        ]);

        $items = array_map(fn (array $i) => [
            'code' => trim($i['code']),
            'name' => $i['name'],
            'unit' => $i['unit'] ?? null,
            'classifierCode' => $i['classifierCode'] ?? null,
            'image' => $i['image'] ?? null,
            'quantity' => (float) $i['quantity'],
            'price' => (float) $i['price'],
        ], $data['items']);

        return [
            'buyer_tin' => $data['buyerTin'] ?? null,
            'buyer_name' => $data['buyerName'],
            'buyer_address' => $data['buyerAddress'] ?? null,
            'delivered_at' => $data['deliveredAt'] ?? null,
            'comment' => $data['comment'] ?? null,
            'items' => $items,
            'total' => round(array_sum(array_map(fn ($i) => $i['quantity'] * $i['price'], $items)), 2),
        ];
    }

    private function own(Request $request, SalesOrder $order): void
    {
        $user = $request->user();
        abort_unless($order->user_id === $user->id && $order->db_entry_id === $user->db_entry_id, Response::HTTP_NOT_FOUND);
    }
}
