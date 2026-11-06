<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EhdmReceipt;
use App\Services\Ehdm\EhdmClient;
use App\Services\Ehdm\EhdmException;
use App\Services\Ehdm\EhdmMath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

/**
 * "Վաճառքներ" → ՀԴՄ կտրոններ: receipts printed through the company's
 * electronic cash register (e-ՀԴՄ) at the tax service.
 */
class EhdmController extends Controller
{
    private function client(Request $request): EhdmClient|JsonResponse
    {
        $entry = $request->user()?->dbEntry;
        if (! $entry || ! $entry->hasEhdm()) {
            return response()->json([
                'message' => 'e-HDM is not set up. Choose its mode (and fill in the register number and certificate) in the admin panel (DB entries).',
            ], Response::HTTP_BAD_REQUEST);
        }

        return EhdmClient::for($entry);
    }

    private function owned(Request $request, EhdmReceipt $receipt): void
    {
        if ($receipt->db_entry_id !== $request->user()?->db_entry_id) {
            abort(Response::HTTP_NOT_FOUND);
        }
    }

    private function failure(EhdmException $e): JsonResponse
    {
        return response()->json(
            ['message' => $e->getMessage(), 'code' => $e->ehdmCode],
            $e->ehdmCode === null ? Response::HTTP_BAD_GATEWAY : Response::HTTP_UNPROCESSABLE_ENTITY,
        );
    }

    private function present(EhdmReceipt $r, bool $full = false): array
    {
        $result = (array) ($r->response ?? []);
        $data = [
            'id' => $r->id,
            'type' => $r->type,
            'mode' => $r->mode,
            'status' => $r->status,
            'receiptId' => $r->receipt_id,
            'fiscal' => $r->fiscal,
            'partnerTin' => $r->partner_tin,
            'cash' => (float) $r->cash_amount,
            'card' => (float) $r->card_amount,
            'total' => (float) $r->total,
            'returnOfId' => $r->return_of_id,
            'returnedTotal' => (float) ($r->returned_total ?? 0),
            'error' => $r->error,
            'user' => $r->user?->name,
            'printedAt' => ($r->printed_at ?? $r->created_at)?->toIso8601String(),
        ];

        if ($full) {
            $data += [
                'crn' => $r->crn,
                'sn' => $r->sn,
                'tin' => $result['tin'] ?? null,
                'taxpayer' => $result['taxpayer'] ?? null,
                'address' => $result['address'] ?? null,
                'change' => (float) $r->change,
                'qr' => $r->qr,
                'items' => $r->items,
                'returnOfReceiptId' => $r->returnOf?->receipt_id,
            ];
        }

        return $data;
    }

    /**
     * The register's setup and the latest receipts.
     */
    public function index(Request $request): JsonResponse
    {
        $entry = $request->user()?->dbEntry;
        $receipts = EhdmReceipt::query()
            ->where('db_entry_id', $request->user()?->db_entry_id)
            ->withSum(['returns as returned_total' => fn ($q) => $q->where('status', EhdmReceipt::STATUS_OK)], 'total')
            ->with('user:id,name')
            ->latest('id')
            ->limit(200)
            ->get();

        return response()->json([
            'mode' => $entry?->ehdm_mode ?? 'off',
            'ready' => (bool) $entry?->hasEhdm(),
            'receipts' => $receipts->map(fn (EhdmReceipt $r) => $this->present($r))->values(),
        ]);
    }

    public function show(Request $request, EhdmReceipt $receipt): JsonResponse
    {
        $this->owned($request, $receipt);
        $receipt->loadSum(['returns as returned_total' => fn ($q) => $q->where('status', EhdmReceipt::STATUS_OK)], 'total');

        return response()->json($this->present($receipt, true));
    }

    /**
     * Prints a sale receipt. Without amounts, it is paid in cash.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'partnerTin' => ['nullable', 'regex:/^\d{8}$/'],
            'cashAmount' => ['nullable', 'numeric', 'min:0'],
            'cardAmount' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.goodName' => ['required', 'string', 'max:50'],
            'items.*.goodCode' => ['nullable', 'string', 'max:50'],
            'items.*.adgCode' => ['required', 'string', 'regex:/^\d{2,}[\d.]*$/', 'max:20'],
            'items.*.unit' => ['required', 'string', 'max:50'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'decimal:0,3'],
            'items.*.price' => ['required', 'numeric', 'gt:0', 'decimal:0,2'],
            'items.*.discount' => ['nullable', 'numeric', 'min:0', 'lt:100'],
        ]);

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        $entry = $request->user()->dbEntry;
        $items = array_map(function (array $item) use ($entry): array {
            $row = [
                'adgCode' => $item['adgCode'],
                'dep' => (int) $entry->ehdm_dep,
                'goodCode' => filled($item['goodCode'] ?? null) ? $item['goodCode'] : $item['adgCode'],
                'goodName' => $item['goodName'],
                'quantity' => round((float) $item['quantity'], 3),
                'unit' => $item['unit'],
                'price' => round((float) $item['price'], 2),
            ];
            if ((float) ($item['discount'] ?? 0) > 0) {
                $row['discount'] = round((float) $item['discount'], 2);
                $row['discountType'] = EhdmMath::DISCOUNT_PERCENT;
            }

            return $row;
        }, $data['items']);

        $total = EhdmMath::total($items);
        $cash = (float) ($data['cashAmount'] ?? 0);
        $card = (float) ($data['cardAmount'] ?? 0);
        if ($cash == 0.0 && $card == 0.0) {
            $cash = $total;
        }

        $receipt = new EhdmReceipt([
            'user_id' => $request->user()->id,
            'db_entry_id' => $entry->id,
            'type' => EhdmReceipt::TYPE_SALE,
            'mode' => $client->mode(),
            'crn' => $client->crn(),
            'partner_tin' => $data['partnerTin'] ?? null,
            'cash_amount' => $cash,
            'card_amount' => $card,
            'total' => $total,
            'items' => $items,
        ]);

        try {
            $result = $client->printReceipt($items, $cash, $card, $data['partnerTin'] ?? null, (int) ($request->user()->ehdm_cashier_id ?: 1));
        } catch (EhdmException $e) {
            $receipt->fill(['status' => EhdmReceipt::STATUS_FAILED, 'error' => $e->getMessage()])->save();

            return $this->failure($e);
        }

        $this->fillResult($receipt, $result)->save();

        return response()->json($this->present($receipt->fresh(['user', 'returnOf']), true), Response::HTTP_CREATED);
    }

    private function fillResult(EhdmReceipt $receipt, array $result): EhdmReceipt
    {
        return $receipt->fill([
            'status' => EhdmReceipt::STATUS_OK,
            'receipt_id' => isset($result['receiptId']) ? (string) $result['receiptId'] : null,
            'fiscal' => $result['fiscal'] ?? null,
            'sn' => $result['sn'] ?? null,
            'crn' => $result['crn'] ?? $receipt->crn,
            'total' => $result['total'] ?? $receipt->total,
            'change' => $result['change'] ?? 0,
            'qr' => $result['qr'] ?? null,
            'printed_at' => isset($result['time']) ? Carbon::createFromTimestampMs((int) $result['time']) : now(),
            'response' => $result,
            'error' => null,
        ]);
    }

    /**
     * A copy of the receipt from the tax service.
     */
    public function copy(Request $request, EhdmReceipt $receipt): JsonResponse
    {
        $this->owned($request, $receipt);
        if ($receipt->status !== EhdmReceipt::STATUS_OK || ! $receipt->receipt_id) {
            return response()->json(['message' => 'The receipt was not printed'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        try {
            $result = $client->printCopy($receipt->receipt_id);
        } catch (EhdmException $e) {
            return $this->failure($e);
        }

        $copy = $this->present($receipt, true);
        $copy['qr'] = $result['qr'] ?? $copy['qr'];
        $copy['copy'] = true;

        return response()->json($copy);
    }

    /**
     * What can still be returned from a sale receipt (rows with receiptProductId).
     */
    public function returnInfo(Request $request, EhdmReceipt $receipt): JsonResponse
    {
        $this->owned($request, $receipt);
        if ($receipt->type !== EhdmReceipt::TYPE_SALE || $receipt->status !== EhdmReceipt::STATUS_OK) {
            return response()->json(['message' => 'Only a printed sale receipt can be returned'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        try {
            $info = $client->returnedReceiptInfo($receipt->receipt_id);
        } catch (EhdmException $e) {
            return $this->failure($e);
        }

        return response()->json([
            'cash' => (float) ($info['cashAmount'] ?? 0),
            'card' => (float) ($info['cardAmount'] ?? 0),
            'total' => (float) ($info['totalAmount'] ?? 0),
            'items' => array_map(fn (array $row) => [
                'receiptProductId' => (int) $row['receiptProductId'],
                'goodName' => $row['goodName'] ?? '',
                'goodCode' => $row['goodCode'] ?? '',
                'unit' => $row['unit'] ?? '',
                'price' => (float) ($row['price'] ?? 0),
                'quantity' => (float) ($row['quantity'] ?? 0),
                'total' => (float) ($row['totalWithTaxes'] ?? 0),
            ], (array) ($info['items'] ?? [])),
        ]);
    }

    /**
     * Prints a return receipt for some rows of a sale receipt.
     */
    public function storeReturn(Request $request, EhdmReceipt $receipt): JsonResponse
    {
        $this->owned($request, $receipt);
        $data = $request->validate([
            'cashAmount' => ['nullable', 'numeric', 'min:0'],
            'cardAmount' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.receiptProductId' => ['required', 'integer', 'min:0'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'decimal:0,3'],
            'items.*.goodName' => ['nullable', 'string', 'max:50'],
        ]);
        if ($receipt->type !== EhdmReceipt::TYPE_SALE || $receipt->status !== EhdmReceipt::STATUS_OK) {
            return response()->json(['message' => 'Only a printed sale receipt can be returned'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        $lines = array_map(fn (array $item) => [
            'receiptProductId' => (int) $item['receiptProductId'],
            'quantity' => round((float) $item['quantity'], 3),
        ], $data['items']);
        $cash = (float) ($data['cashAmount'] ?? 0);
        $card = (float) ($data['cardAmount'] ?? 0);

        $return = new EhdmReceipt([
            'user_id' => $request->user()->id,
            'db_entry_id' => $receipt->db_entry_id,
            'return_of_id' => $receipt->id,
            'type' => EhdmReceipt::TYPE_RETURN,
            'mode' => $client->mode(),
            'crn' => $receipt->crn,
            'partner_tin' => $receipt->partner_tin,
            'cash_amount' => $cash,
            'card_amount' => $card,
            'total' => EhdmMath::money($cash + $card),
            'items' => array_map(fn (array $item) => [
                'receiptProductId' => (int) $item['receiptProductId'],
                'goodName' => $item['goodName'] ?? null,
                'quantity' => round((float) $item['quantity'], 3),
            ], $data['items']),
        ]);

        try {
            $result = $client->printReturn($receipt->receipt_id, $lines, $cash, $card);
        } catch (EhdmException $e) {
            $return->fill(['status' => EhdmReceipt::STATUS_FAILED, 'error' => $e->getMessage()])->save();

            return $this->failure($e);
        }

        $this->fillResult($return, $result)->save();

        return response()->json($this->present($return->fresh(['user', 'returnOf']), true), Response::HTTP_CREATED);
    }
}
