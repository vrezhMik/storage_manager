<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EinvoiceDocument;
use App\Services\Einvoice\EinvoiceClient;
use App\Services\Einvoice\EinvoiceException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * "Վաճառքներ": account documents (հաշիվ-վավերագիր) written in the terminal and
 * sent to the tax service's e-invoicing system as drafts.
 */
class SalesController extends Controller
{
    private function client(Request $request): EinvoiceClient|JsonResponse
    {
        $entry = $request->user()?->dbEntry;
        if (! $entry || ! $entry->hasEinvoiceAccount()) {
            return response()->json([
                'message' => 'E-invoicing account is not set up. Fill in TIN, login and password in the admin panel (DB entries).',
            ], Response::HTTP_BAD_REQUEST);
        }

        return EinvoiceClient::for($entry);
    }

    /**
     * ?tin=XXXXXXXX -> {tin, name, address} of the buyer from the tax service.
     */
    public function taxpayer(Request $request): JsonResponse
    {
        $tin = (string) $request->query('tin', '');
        if (! preg_match('/^\d{8}$/', $tin)) {
            return response()->json(['message' => 'TIN must be 8 digits'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        try {
            $info = $client->taxpayer($tin);
        } catch (EinvoiceException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }

        if (! $info) {
            return response()->json(['message' => 'Taxpayer not found'], Response::HTTP_NOT_FOUND);
        }

        return response()->json([
            'tin' => $tin,
            'name' => $info['name'] ?? $info['taxpayerName'] ?? null,
            'address' => $info['address'] ?? $info['legalAddress'] ?? null,
            'vatTin' => $info['vatNumber'] ?? $info['vatTin'] ?? null,
        ]);
    }

    public function documents(Request $request): JsonResponse
    {
        $docs = EinvoiceDocument::query()
            ->where('db_entry_id', $request->user()?->db_entry_id)
            ->with('user:id,name')
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn (EinvoiceDocument $doc) => [
                'id' => $doc->id,
                'type' => $doc->type,
                'status' => $doc->status,
                'srcId' => $doc->src_id,
                'buyerTin' => $doc->buyer_tin,
                'buyerName' => $doc->buyer_name,
                'deliveredAt' => $doc->delivered_at?->format('Y-m-d'),
                'total' => (float) $doc->total,
                'serialNo' => $doc->serial_no,
                'signedAt' => $doc->signed_at?->toIso8601String(),
                'error' => $doc->error,
                'user' => $doc->user?->name,
                'createdAt' => $doc->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'documents' => $docs,
            // How this user signs: cosign, mobile_id, nikita or null (cannot sign).
            'canSign' => (bool) $request->user()?->canSignEinvoices(),
            'signMethod' => $request->user()?->signMethod(),
        ]);
    }

    /**
     * Starts signing a draft with the user's signing method (CoSign, Mobile ID
     * or Nikita). Answers at once with SIGNING; the terminal then asks
     * signStatus() until the document is issued.
     */
    public function sign(Request $request, EinvoiceDocument $document): JsonResponse
    {
        if ($document->db_entry_id !== $request->user()?->db_entry_id) {
            abort(Response::HTTP_NOT_FOUND);
        }

        if ($document->status !== EinvoiceDocument::STATUS_DRAFT || ! $document->src_id) {
            return response()->json(['message' => 'Only a draft can be signed'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        return $this->signDocument($request, $client, $document);
    }

    /**
     * One check of a document that is being signed.
     */
    public function signStatus(Request $request, EinvoiceDocument $document): JsonResponse
    {
        if ($document->db_entry_id !== $request->user()?->db_entry_id) {
            abort(Response::HTTP_NOT_FOUND);
        }

        if ($document->status === EinvoiceDocument::STATUS_SIGNING && $document->sign_request_id) {
            $client = $this->client($request);
            if ($client instanceof JsonResponse) {
                return $client;
            }

            try {
                $check = $client->checkSigning($document->sign_request_id, $document->src_id);
                if ($check['state'] === 'SIGNED') {
                    $document->status = EinvoiceDocument::STATUS_ISSUED;
                    $document->serial_no = $check['serialNo'];
                    $document->signed_at = $check['signedAt'] ?? now();
                    $document->error = null;
                } elseif ($check['state'] === 'FAILED') {
                    // Back to a draft: it can be signed again or on the site.
                    $document->status = EinvoiceDocument::STATUS_DRAFT;
                    $document->error = $check['message'];
                } elseif ($document->updated_at && $document->updated_at->lt(now()->subMinutes(5))) {
                    // Nobody confirmed on the phone within 5 minutes.
                    $document->status = EinvoiceDocument::STATUS_DRAFT;
                    $document->error = 'Signing was not confirmed in time';
                }
                $document->save();
            } catch (EinvoiceException $e) {
                return response()->json(['message' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
            }
        }

        return response()->json($this->signAnswer($document));
    }

    private function signDocument(Request $request, EinvoiceClient $client, EinvoiceDocument $document): JsonResponse
    {
        $user = $request->user();
        $method = $user->signMethod();
        if ($method === null) {
            return response()->json([
                'message' => 'No signing method for this user. Fill in CoSign, Mobile ID or Nikita in the admin panel (Users).',
            ], Response::HTTP_BAD_REQUEST);
        }

        try {
            $document->sign_request_id = $client->startSigning($document->src_id, $method, [
                'username' => $user->cosign_username,
                'password' => $user->cosign_password,
                'phone' => $method === 'mobile_id' ? $user->mobile_id_phone : $user->nikita_phone,
            ]);
            $document->sign_method = $method;
            $document->status = EinvoiceDocument::STATUS_SIGNING;
            $document->error = null;
        } catch (EinvoiceException $e) {
            // The draft stays a draft: it can be signed again or on the site.
            $document->error = $e->getMessage();
        } catch (Throwable $e) {
            report($e);
            $document->error = 'E-invoicing is not reachable right now';
        }

        $document->save();

        return response()->json(
            $this->signAnswer($document),
            $document->status === EinvoiceDocument::STATUS_SIGNING ? Response::HTTP_ACCEPTED : Response::HTTP_BAD_GATEWAY,
        );
    }

    private function signAnswer(EinvoiceDocument $document): array
    {
        return [
            'id' => $document->id,
            'status' => $document->status,
            'signMethod' => $document->sign_method,
            'serialNo' => $document->serial_no,
            'error' => $document->error,
        ];
    }

    /**
     * Creates a draft account document in e-invoicing and records it.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(array_keys(EinvoiceClient::TYPES))],
            'buyerTin' => ['required', 'regex:/^\d{8}$/'],
            'buyerName' => ['nullable', 'string', 'max:255'],
            'buyerAddress' => ['nullable', 'string', 'max:500'],
            'deliveredAt' => ['required', 'date_format:Y-m-d'],
            'additionalInfo' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.name' => ['required', 'string', 'max:500'],
            'items.*.classifierCode' => [Rule::requiredIf($request->input('type') === 'ACC_DOC_GOODS'), 'nullable', 'string', 'max:20'],
            'items.*.unit' => ['required', 'string', 'max:50'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unitPrice' => ['required', 'numeric', 'gte:0'],
            'sign' => ['sometimes', 'boolean'],
        ]);

        $client = $this->client($request);
        if ($client instanceof JsonResponse) {
            return $client;
        }

        $total = round(collect($data['items'])->sum(fn ($i) => round($i['quantity'] * $i['unitPrice'], 2)), 2);
        $doc = new EinvoiceDocument([
            'user_id' => $request->user()->id,
            'db_entry_id' => $request->user()->db_entry_id,
            'type' => $data['type'],
            'status' => EinvoiceDocument::STATUS_FAILED,
            'buyer_tin' => $data['buyerTin'],
            'buyer_name' => $data['buyerName'] ?? null,
            'delivered_at' => $data['deliveredAt'],
            'total' => $total,
            'items' => $data['items'],
        ]);

        try {
            $result = $client->createAccDocDraft($data);
            $doc->src_id = $result['id'];
            $doc->response = $result['answer']['raw'];
            if ($result['answer']['ok']) {
                $doc->status = EinvoiceDocument::STATUS_DRAFT;
            } else {
                $doc->error = $result['answer']['failure']['message'] ?? $result['answer']['failure']['code'] ?? 'Rejected by e-invoicing';
            }
        } catch (EinvoiceException $e) {
            $doc->error = $e->getMessage();
        } catch (Throwable $e) {
            report($e);
            $doc->error = 'E-invoicing is not reachable right now';
        }

        $doc->save();

        // "Create and sign": issue the new draft right away.
        if ($doc->status === EinvoiceDocument::STATUS_DRAFT && $request->boolean('sign')) {
            return $this->signDocument($request, $client, $doc);
        }

        return response()->json([
            'id' => $doc->id,
            'status' => $doc->status,
            'srcId' => $doc->src_id,
            'error' => $doc->error,
        ], $doc->status === EinvoiceDocument::STATUS_DRAFT ? Response::HTTP_CREATED : Response::HTTP_BAD_GATEWAY);
    }
}
