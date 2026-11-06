<?php

namespace App\Services\Ehdm;

use App\Models\DbEntry;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * The tax service's electronic cash register (e-ՀԴՄ) web service.
 *
 * Every call is a JSON POST to <root>/api/v1.0/<method> with the register's
 * number (crn) and, for most methods, a request number (seq) that has to grow
 * with every request. The tax service accepts only the IP registered for the
 * register and its client certificate. Answers look like
 * {code, message, errorMessage, result}; code 0 is success.
 *
 * Modes: "mock" answers like the tax service without leaving the server
 * (EhdmMock), "test" is the tax service's test system, "live" the real one.
 */
class EhdmClient
{
    public const MODES = ['off', 'mock', 'test', 'live'];

    // Methods that carry the request number.
    private const SEQ_METHODS = ['configureDepartments', 'print', 'printCopy', 'getReturnedReceiptInfo', 'printReturnReceipt'];

    public function __construct(private DbEntry $entry) {}

    public static function for(DbEntry $entry): self
    {
        if (! $entry->hasEhdm()) {
            throw new EhdmException('e-HDM is not set up for this company');
        }

        return new self($entry);
    }

    public function mode(): string
    {
        return (string) $this->entry->ehdm_mode;
    }

    public function crn(): string
    {
        return (string) ($this->entry->ehdm_crn ?: EhdmMock::DEFAULT_CRN);
    }

    public function checkConnection(): string
    {
        return (string) $this->call('checkConnection', []);
    }

    public function activate(): string
    {
        return (string) $this->call('activate', []);
    }

    /**
     * @param  array<int, int>  $departments  department number => tax regime (1, 2, 3 or 7)
     */
    public function configureDepartments(array $departments): string
    {
        $list = [];
        foreach ($departments as $dep => $regime) {
            $list[] = ['dep' => (int) $dep, 'taxRegime' => (int) $regime];
        }

        return (string) $this->call('configureDepartments', ['departments' => $list]);
    }

    /**
     * Prints a sale receipt with goods (mode 2). Returns the tax service's
     * result: receiptId, crn, sn, tin, taxpayer, address, time, fiscal, total, change, qr.
     */
    public function printReceipt(array $items, float $cash, float $card, ?string $partnerTin, int $cashierId): array
    {
        return (array) $this->call('print', [
            'cardAmount' => $card,
            'cashAmount' => $cash,
            'partialAmount' => 0,
            'prePaymentAmount' => 0,
            'cashierId' => $cashierId,
            'mode' => 2,
            'partnerTin' => $partnerTin,
            'items' => $items,
        ]);
    }

    public function printCopy(string $receiptId): array
    {
        return (array) $this->call('printCopy', ['receiptId' => $receiptId]);
    }

    /**
     * The receipt being returned, with its rows' receiptProductId.
     */
    public function returnedReceiptInfo(string $receiptId): array
    {
        return (array) $this->call('getReturnedReceiptInfo', ['receiptId' => $receiptId]);
    }

    /**
     * @param  array<int, array{receiptProductId: int, quantity: float}>  $items
     */
    public function printReturn(string $receiptId, array $items, float $cash, float $card): array
    {
        return (array) $this->call('printReturnReceipt', [
            'receiptId' => $receiptId,
            'cardAmountForReturn' => $card,
            'cashAmountForReturn' => $cash,
            'returnItemList' => $items,
        ]);
    }

    /**
     * One call; returns the answer's "result" or throws the tax service's error.
     */
    public function call(string $method, array $payload): mixed
    {
        // A request number the tax service rejects (104 INVALID_SEQ) is
        // skipped: the next one is larger.
        for ($attempt = 0; ; $attempt++) {
            $body = ['crn' => $this->crn()] + $payload;
            if (in_array($method, self::SEQ_METHODS, true)) {
                $body = ['crn' => $body['crn'], 'seq' => $this->nextSeq()] + $body;
            }

            $answer = $this->send($method, $body);

            if ((int) ($answer['code'] ?? -1) === 0) {
                return $answer['result'] ?? null;
            }
            if ((int) ($answer['code'] ?? -1) === 104 && $attempt < 3) {
                continue;
            }

            $code = isset($answer['code']) ? (int) $answer['code'] : null;
            $constant = $answer['message'] ?? null;
            $text = $answer['errorMessage'] ?? $constant ?? 'Unknown error';

            throw new EhdmException('e-HDM error'.($code !== null ? ' '.$code : '').($constant ? ' '.$constant : '').': '.$text, $code, $constant);
        }
    }

    /**
     * The next request number, kept per company so it always grows.
     */
    private function nextSeq(): int
    {
        return DB::transaction(function (): int {
            $row = DbEntry::query()->whereKey($this->entry->id)->lockForUpdate()->first(['id', 'ehdm_seq']);
            $seq = (int) $row->ehdm_seq + 1;
            DbEntry::query()->whereKey($this->entry->id)->update(['ehdm_seq' => $seq]);
            $this->entry->ehdm_seq = $seq;

            return $seq;
        });
    }

    private function send(string $method, array $body): array
    {
        if ($this->mode() === 'mock') {
            return EhdmMock::for($this->entry)->handle($method, $body);
        }

        $root = rtrim((string) config('services.ehdm.'.($this->mode() === 'live' ? 'live_url' : 'test_url')), '/');

        // The certificate (and its key) as PEM, written for the call only.
        $dir = storage_path('app/private/ehdm');
        if (! is_dir($dir)) {
            mkdir($dir, 0700, true);
        }
        $pem = tempnam($dir, 'cert');
        file_put_contents($pem, (string) $this->entry->ehdm_cert);
        chmod($pem, 0600);
        $password = (string) ($this->entry->ehdm_cert_password ?? '');

        $verify = $this->mode() === 'live'
            ? (config('services.ehdm.ca_file') ?: true)
            : (config('services.ehdm.test_verify') ? (config('services.ehdm.ca_file') ?: true) : false);

        try {
            $response = Http::connectTimeout(10)
                ->timeout(60)
                ->acceptJson()
                ->withHeaders(['language' => 'hy'])
                ->withOptions([
                    'http_errors' => false,
                    'cert' => $password !== '' ? [$pem, $password] : $pem,
                    'ssl_key' => $password !== '' ? [$pem, $password] : $pem,
                    'verify' => $verify,
                ])
                ->post($root.'/api/v1.0/'.$method, $body);
        } catch (ConnectionException $e) {
            throw new EhdmException('The e-HDM service is not reachable from this server ('.$e->getMessage().')');
        } finally {
            @unlink($pem);
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new EhdmException('Unexpected answer from the e-HDM service (HTTP '.$response->status().')');
        }

        return $json;
    }
}
