<?php

namespace App\Services\Einvoice;

use App\Models\DbEntry;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * The tax service's e-invoicing system (taxservice.am).
 *
 * Login is a SOAP call that returns a token; every other call is JSON to
 * e-invoicing.taxservice.am/api/... with the token in the jwt-auth-token
 * cookie. Answers look like {ok, payload, failure: {code, message}}.
 */
class EinvoiceClient
{
    public const LOGIN_URL = 'https://ews.taxservice.am/taxsystem-fe-ws/taxpayer/loginService';

    public const API_URL = 'https://e-invoicing.taxservice.am/api';

    // Account documents (հաշիվ-վավերագիր) the terminal can create.
    public const TYPES = [
        'ACC_DOC_GOODS' => 'acc-doc-goods/acc-doc-goods-create-draft',
        'ACC_DOC_SERVICES' => 'acc-doc-services/acc-doc-services-create-draft',
    ];

    public function __construct(private DbEntry $entry) {}

    public static function for(DbEntry $entry): self
    {
        if (! $entry->hasEinvoiceAccount()) {
            throw new EinvoiceException('E-invoicing account is not set up for this company');
        }

        return new self($entry);
    }

    public function token(bool $fresh = false): string
    {
        $key = 'einvoice-token:'.$this->entry->id.':'.md5($this->entry->einvoice_tin.'|'.$this->entry->einvoice_login.'|'.$this->entry->einvoice_password);

        if ($fresh) {
            Cache::forget($key);
        }

        return Cache::remember($key, now()->addMinutes(20), function (): string {
            $esc = fn (string $value) => htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $body = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://www.taxservice.am/tp3/invoice/definitions">'
                .'<soapenv:Header/><soapenv:Body>'
                .'<def:LoginWebRequest Tin="'.$esc((string) $this->entry->einvoice_tin).'"'
                .' Login="'.$esc((string) $this->entry->einvoice_login).'"'
                .' Password="'.$esc((string) $this->entry->einvoice_password).'"'
                .' ClientType="API" ClientDescription="Flexit terminal"/>'
                .'</soapenv:Body></soapenv:Envelope>';

            $response = Http::timeout(30)
                ->withBody($body, 'text/xml;charset=UTF-8')
                ->withOptions(['http_errors' => false])
                ->post(self::LOGIN_URL);

            if (preg_match('#<AuthToken>([^<]+)</AuthToken>#', $response->body(), $m)) {
                return trim($m[1]);
            }

            // The service explains a wrong login in <... Message="...">.
            preg_match('#Message="([^"]*)"#', $response->body(), $msg);
            throw new EinvoiceException('Login to e-invoicing failed'.(! empty($msg[1]) ? ': '.html_entity_decode($msg[1]) : ' (HTTP '.$response->status().')'));
        });
    }

    /**
     * One API call. Retries once with a new token when the old one expired.
     *
     * @return array{ok: bool, payload: mixed, failure: array|null, raw: array|null}
     */
    public function call(string $path, array $payload): array
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $response = Http::timeout(60)
                ->acceptJson()
                ->withHeaders(['Cookie' => 'jwt-auth-token='.$this->token($attempt > 0)])
                ->withOptions(['http_errors' => false])
                ->post(self::API_URL.'/'.$path, ['payload' => $payload]);

            if (in_array($response->status(), [401, 403], true) && $attempt === 0) {
                continue;
            }

            $json = $response->json();
            if (! is_array($json)) {
                throw new EinvoiceException('Unexpected answer from e-invoicing (HTTP '.$response->status().')');
            }

            return [
                'ok' => (bool) ($json['ok'] ?? false),
                'payload' => $json['payload'] ?? null,
                'failure' => $json['failure'] ?? null,
                'raw' => $json,
            ];
        }

        throw new EinvoiceException('E-invoicing rejected the login token');
    }

    /**
     * Name and address of a taxpayer by TIN (for filling in the buyer).
     */
    public function taxpayer(string $tin): ?array
    {
        $answer = $this->call('tpinfo/tp-info-by-tin', ['tin' => $tin, 'checkDate' => now()->toIso8601String()]);

        return $answer['ok'] && is_array($answer['payload']) ? $answer['payload'] : null;
    }

    /**
     * ID of an ԱՏԳ ԱԱ code in the tax service's classifier (cached for a day).
     */
    public function classifierId(string $code): ?string
    {
        $map = Cache::remember('einvoice-classifier', now()->addDay(), function (): array {
            $answer = $this->call('dictionaries/classifier-list', []);
            if (! $answer['ok'] || ! is_array($answer['payload'])) {
                throw new EinvoiceException('Could not load the ԱՏԳ ԱԱ classifier: '.($answer['failure']['message'] ?? 'unknown error'));
            }

            $map = [];
            foreach ($answer['payload'] as $row) {
                if (isset($row['code'], $row['id'])) {
                    $map[(string) $row['code']] = (string) $row['id'];
                }
            }

            return $map;
        });

        return $map[trim($code)] ?? null;
    }

    // Pause between status checks while the tax service prepares (ms; 0 in tests).
    public static int $pollDelayMs = 1500;

    // Checks while waiting for the document to be ready for signing (~20 s,
    // well inside the web server's request time limit).
    public static int $pollAttempts = 14;

    // Signing endpoints per method; mobile ones take only the phone number.
    private const SIGN_PATHS = [
        'cosign' => 'dispatcher/issue-co-sign',
        'mobile_id' => 'dispatcher/issue-mts',
        'nikita' => 'dispatcher/issue-nikita',
    ];

    /**
     * Starts signing a draft: request-issue -> wait for SIGN_WAITING -> send
     * the signature request (CoSign signs at once; Mobile ID and Nikita wait
     * for the signer to confirm on the phone). Returns the sign task id;
     * checkSigning() then follows it.
     *
     * @param  array{username?: string, password?: string, phone?: string}  $signer
     */
    public function startSigning(string $draftId, string $method, array $signer): string
    {
        $path = self::SIGN_PATHS[$method] ?? throw new EinvoiceException('Unknown signing method '.$method);
        $requestId = (string) Str::uuid();

        $answer = $this->call('dispatcher/request-issue', ['requestId' => $requestId, 'ids' => $draftId]);
        $this->failOn($answer, 'The tax service did not accept the document for signing');

        $this->waitForSignTask($requestId, ['SIGN_WAITING', 'SIGN_PROCESSING', 'SIGNED']);

        $payload = ['requestId' => $requestId];
        if ($method === 'cosign') {
            $payload['username'] = $signer['username'] ?? '';
            $payload['password'] = $signer['password'] ?? '';
        } else {
            $payload['phone'] = self::phone($signer['phone'] ?? '');
        }

        $answer = $this->call($path, $payload);
        $this->failOn($answer, 'Signing request failed');

        return $requestId;
    }

    /**
     * One look at a sign task.
     *
     * @return array{state: string, serialNo: ?string, signedAt: ?string, message: ?string}
     *   state: SIGNED, PENDING (still waiting, e.g. for the phone) or FAILED
     */
    public function checkSigning(string $requestId, string $draftId): array
    {
        $answer = $this->call('dispatcher/sign-task-by-id', ['id' => $requestId]);
        $task = is_array($answer['payload']) ? $answer['payload'] : [];
        $state = $task['state'] ?? null;

        if (in_array($state, ['FAILED', 'SIGN_FAILED'], true)) {
            return ['state' => 'FAILED', 'serialNo' => null, 'signedAt' => null, 'message' => 'Signing failed'.(! empty($task['failMessage']) ? ': '.$task['failMessage'] : '')];
        }
        if ($state !== 'SIGNED') {
            return ['state' => 'PENDING', 'serialNo' => null, 'signedAt' => null, 'message' => null];
        }

        $items = $this->call('dispatcher/sign-task-item-by-invoice-id', ['id' => $draftId]);
        $rows = collect(is_array($items['payload']) ? $items['payload'] : []);
        $item = $rows->first(fn ($row) => ($row['signTaskId'] ?? null) === $requestId) ?? $rows->last() ?? [];

        if (! empty($item['failMessage'])) {
            return ['state' => 'FAILED', 'serialNo' => null, 'signedAt' => null, 'message' => $item['failMessage']];
        }

        return ['state' => 'SIGNED', 'serialNo' => $item['serialNo'] ?? null, 'signedAt' => $task['signedAt'] ?? null, 'message' => null];
    }

    // "+374 91 12-34-56" / "091123456" -> "37491123456".
    public static function phone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '0') && strlen($digits) === 9) {
            $digits = '374'.substr($digits, 1);
        } elseif (strlen($digits) === 8) {
            $digits = '374'.$digits;
        }

        return $digits;
    }

    private function failOn(array $answer, string $message): void
    {
        if (! $answer['ok']) {
            throw new EinvoiceException($message.': '.($answer['failure']['message'] ?? $answer['failure']['code'] ?? 'unknown error'));
        }
    }

    /**
     * Checks the sign task until it reaches one of $states.
     */
    private function waitForSignTask(string $requestId, array $states): array
    {
        for ($i = 0; $i < self::$pollAttempts; $i++) {
            $answer = $this->call('dispatcher/sign-task-by-id', ['id' => $requestId]);
            $task = is_array($answer['payload']) ? $answer['payload'] : [];
            $state = $task['state'] ?? null;

            if (in_array($state, ['FAILED', 'SIGN_FAILED'], true)) {
                throw new EinvoiceException('Signing failed'.(! empty($task['failMessage']) ? ': '.$task['failMessage'] : ''));
            }
            if (in_array($state, $states, true)) {
                return $task;
            }
            if (self::$pollDelayMs > 0) {
                usleep(self::$pollDelayMs * 1000);
            }
        }

        throw new EinvoiceException('The tax service did not prepare the document for signing in time. Try again in a minute.');
    }

    /**
     * Creates a draft account document (հաշիվ-վավերագիր). Nothing is issued:
     * the draft is checked and signed on the e-invoicing site.
     *
     * @param  array{type: string, buyerTin: string, buyerName: ?string, buyerAddress: ?string, deliveredAt: string, additionalInfo: ?string, items: array}  $doc
     * @return array{id: string, answer: array}
     */
    public function createAccDocDraft(array $doc): array
    {
        $path = self::TYPES[$doc['type']] ?? throw new EinvoiceException('Unknown document type '.$doc['type']);
        $id = (string) Str::uuid();
        $supplier = $this->taxpayer((string) $this->entry->einvoice_tin) ?? [];

        $items = [];
        $total = 0.0;
        foreach (array_values($doc['items']) as $i => $item) {
            $value = round((float) $item['quantity'] * (float) $item['unitPrice'], 2);
            $total += $value;
            $row = [
                'mode' => 'new',
                'id' => (string) Str::uuid(),
                'invoiceId' => $id,
                'seqNo' => $i + 1,
                'name' => $item['name'],
                'unit' => $item['unit'],
                'quantity' => (float) $item['quantity'],
                'unitPrice' => (float) $item['unitPrice'],
                'totalValue' => $value,
            ];
            if ($doc['type'] === 'ACC_DOC_GOODS') {
                $classifier = $this->classifierId((string) $item['classifierCode']);
                if ($classifier === null) {
                    throw new EinvoiceException('ԱՏԳ ԱԱ code '.$item['classifierCode'].' is not in the tax service classifier (row '.($i + 1).')');
                }
                $row['classifierId'] = $classifier;
            }
            $items[] = $row;
        }

        $payload = array_filter([
            'id' => $id,
            'status' => 'DRAFT',
            'deliveredAt' => $doc['deliveredAt'].'T00:00:00.000Z',
            'additionalInfo' => $doc['additionalInfo'] ?? null,
            'supplierTin' => $this->entry->einvoice_tin,
            'supplierName' => $supplier['name'] ?? $supplier['taxpayerName'] ?? null,
            'supplierAddress' => $supplier['address'] ?? $supplier['legalAddress'] ?? null,
            'buyerHasNoTin' => false,
            'buyerIsNatural' => false,
            'buyerTin' => $doc['buyerTin'],
            'buyerName' => $doc['buyerName'] ?? null,
            'buyerAddress' => $doc['buyerAddress'] ?? null,
            'items' => $items,
            'totalValue' => round($total, 2),
            'tin' => $this->entry->einvoice_tin,
        ], fn ($value) => $value !== null);

        return ['id' => $id, 'answer' => $this->call($path, $payload)];
    }
}
