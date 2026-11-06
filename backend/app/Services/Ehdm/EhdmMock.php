<?php

namespace App\Services\Ehdm;

use App\Models\DbEntry;
use Illuminate\Support\Facades\Cache;

/**
 * Answers like the tax service's e-ՀԴՄ web service (manual of 12.2024), for
 * trying the terminal before the register is registered. Nothing leaves the
 * server; receipts are kept in the cache under the register number.
 */
class EhdmMock
{
    public const DEFAULT_CRN = '00000000';

    private const ERRORS = [
        103 => ['INVALID_CRN', 'Սխալ ՀԴՄ գրանցման համար'],
        104 => ['INVALID_SEQ', 'Սխալ արժեք seq դաշտի համար'],
        105 => ['WRONG_JSON', 'Սխալ JSON'],
        152 => ['PAID_AMOUNT_LESS_THAN_TOTAL', 'Վճարված գումարը փոքր է ընդհանուր գումարից'],
        158 => ['RETURN_RECEIPT_ALREADY_RETURNED', 'Կտրոնն արդեն ամբողջությամբ վերադարձված է'],
        159 => ['NON_POSITIVE_VALUE', 'Արժեքը պետք է լինի դրական'],
        160 => ['INVALID_DISCOUNT_VALUE', 'Սխալ զեղչ'],
        161 => ['INVALID_GOOD_CODE', 'Սխալ ապրանքի կոդ'],
        162 => ['INVALID_GOOD_NAME', 'Սխալ ապրանքի անվանում'],
        163 => ['INVALID_RECEIPT_PRODUCT_ID_PRESENT', 'Սխալ receiptProductId'],
        164 => ['INVALID_MEASURE_UNIT', 'Սխալ չափման միավոր'],
        165 => ['ITEM_FULL_PRICE_NON_POSITIVE', 'Ապրանքի գինը պետք է լինի դրական'],
        167 => ['CARD_AMOUNT_EXCEEDED_TOTAL', 'Անկանխիկ գումարը գերազանցում է ընդհանուր գումարը'],
        176 => ['RECEIPT_DOES_NOT_EXIST', 'Կտրոնը գոյություն չունի'],
        178 => ['RETURN_RECEIPT_WRONG_AMOUNTS', 'Վերադարձվող գումարները սխալ են'],
        181 => ['INVALID_QUANTITY_FOR_ITEM', 'Սխալ քանակ'],
        182 => ['RETURN_RECEIPT_IS_RETURN_TYPE', 'Վերադարձի կտրոնը հնարավոր չէ վերադարձնել'],
        183 => ['INVALID_ADG_CODE', 'Սխալ ԱՏԳ կոդ'],
        195 => ['CRM_ACTIVATION_FAILED', 'Էլեկտրոնային ՀԴՄ ակտիվացումը ձախողվել է'],
    ];

    private string $key;

    private array $state;

    public function __construct(private DbEntry $entry)
    {
        $this->key = 'ehdm-mock:'.$entry->id.':'.$this->crn();
    }

    public static function for(DbEntry $entry): self
    {
        return new self($entry);
    }

    public static function forget(DbEntry $entry): void
    {
        Cache::forget((new self($entry))->key);
    }

    private function crn(): string
    {
        return (string) ($this->entry->ehdm_crn ?: self::DEFAULT_CRN);
    }

    public function handle(string $method, array $body): array
    {
        return Cache::lock($this->key.':lock', 10)->block(5, function () use ($method, $body): array {
            $this->state = Cache::get($this->key, ['seq' => null, 'active' => false, 'departments' => [], 'next' => 1, 'receipts' => []]);

            $answer = $this->dispatch($method, $body);
            Cache::forever($this->key, $this->state);

            return $answer;
        });
    }

    private function dispatch(string $method, array $body): array
    {
        if (($body['crn'] ?? null) !== $this->crn()) {
            return $this->error(103);
        }

        if (in_array($method, ['configureDepartments', 'print', 'printCopy', 'getReturnedReceiptInfo', 'printReturnReceipt'], true)) {
            if (! is_int($body['seq'] ?? null)) {
                return $this->error(105, 'seq դաշտը պարտադիր է');
            }
            if ($this->state['seq'] !== null && $body['seq'] <= $this->state['seq']) {
                return $this->error(104, 'Սխալ արժեք seq դաշտի համար. '.$body['seq']);
            }
            $this->state['seq'] = $body['seq'];
        }

        return match ($method) {
            'checkConnection' => $this->ok('Գործողությունը հաջողությամբ ավարտվեց'),
            'activate' => $this->activate(),
            'configureDepartments' => $this->configureDepartments($body),
            'getGoodList' => $this->ok(['goodLists' => []]),
            'print' => $this->print($body),
            'printCopy' => $this->printCopy($body),
            'getReturnedReceiptInfo' => $this->returnedInfo($body),
            'printReturnReceipt' => $this->printReturn($body),
            default => ['code' => 404, 'message' => 'NOT_FOUND', 'errorMessage' => 'Unknown method '.$method],
        };
    }

    private function ok(mixed $result): array
    {
        return ['code' => 0, 'message' => 'OK', 'result' => $result];
    }

    private function error(int $code, ?string $text = null): array
    {
        [$constant, $default] = self::ERRORS[$code];

        return ['code' => $code, 'message' => $constant, 'errorMessage' => $text ?? $default];
    }

    private function activate(): array
    {
        if ($this->state['active']) {
            return $this->error(195, 'Էլեկտրոնային ՀԴՄ-ն արդեն Գործող կարգավիճակում է');
        }
        $this->state['active'] = true;

        return $this->ok('Գործողությունը հաջողությամբ ավարտվեց');
    }

    private function configureDepartments(array $body): array
    {
        $departments = [];
        foreach ((array) ($body['departments'] ?? []) as $row) {
            if (! in_array((int) ($row['taxRegime'] ?? 0), [1, 2, 3, 7], true) || (int) ($row['dep'] ?? 0) < 1) {
                return $this->error(105, 'Սխալ բաժին կամ հարկման ռեժիմ');
            }
            $departments[(int) $row['dep']] = (int) $row['taxRegime'];
        }
        $this->state['departments'] = $departments;

        return $this->ok('Գործողությունը հաջողությամբ ավարտվեց');
    }

    private function print(array $body): array
    {
        if ((int) ($body['mode'] ?? 0) !== 2) {
            return $this->error(105, 'Փորձարկման ռեժիմում հասանելի է միայն ապրանքներով կտրոն (mode 2)');
        }
        $items = $body['items'] ?? null;
        if (! is_array($items) || $items === []) {
            return $this->error(105, 'items դաշտը դատարկ է');
        }
        $partnerTin = $body['partnerTin'] ?? null;
        if ($partnerTin !== null && ! preg_match('/^\d{8}$/', (string) $partnerTin)) {
            return $this->error(105, 'partnerTin-ը պետք է լինի 8 նիշ');
        }

        $rows = [];
        foreach ($items as $i => $item) {
            if ($problem = $this->badItem($item)) {
                return $problem;
            }
            $dep = (int) ($item['dep'] ?? 0);
            if ($this->state['departments'] !== [] && ! isset($this->state['departments'][$dep])) {
                return $this->error(105, 'Բաժին '.$dep.' գոյություն չունի');
            }
            $rows[] = $item + [
                'receiptProductId' => $i,
                'taxRegime' => $this->state['departments'][$dep] ?? 1,
                'total' => EhdmMath::lineTotal($item),
                'returned' => 0.0,
            ];
        }

        $total = EhdmMath::total($items);
        $cash = (float) ($body['cashAmount'] ?? 0);
        $card = (float) ($body['cardAmount'] ?? 0);
        $partial = (float) ($body['partialAmount'] ?? 0);
        $prepayment = (float) ($body['prePaymentAmount'] ?? 0);
        foreach ([$cash, $card, $partial, $prepayment] as $amount) {
            if ($amount < 0) {
                return $this->error(159);
            }
        }
        if (EhdmMath::money($card + $partial + $prepayment) > $total) {
            return $this->error(167);
        }
        if (EhdmMath::money($cash + $card + $partial + $prepayment) < $total) {
            return $this->error(152);
        }

        $receipt = [
            'receiptId' => (string) $this->state['next']++,
            'type' => 'SALE',
            'cashierId' => (int) ($body['cashierId'] ?? 0),
            'partnerTin' => $partnerTin,
            'cash' => $cash,
            'card' => $card,
            'partial' => $partial,
            'prepayment' => $prepayment,
            'total' => $total,
            'change' => EhdmMath::money($cash + $card + $partial + $prepayment - $total),
            'time' => (int) floor(microtime(true) * 1000),
            'fiscal' => (string) random_int(10000000, 99999999),
            'items' => $rows,
        ];
        $this->state['receipts'][$receipt['receiptId']] = $receipt;

        return $this->ok($this->result($receipt));
    }

    private function badItem(mixed $item): ?array
    {
        if (! is_array($item)) {
            return $this->error(105);
        }
        $text = fn ($v) => is_string($v) && trim($v) !== '' && mb_strlen($v) <= 50;
        if (! $text($item['goodCode'] ?? null)) {
            return $this->error(161);
        }
        if (! $text($item['goodName'] ?? null)) {
            return $this->error(162);
        }
        if (! $text($item['unit'] ?? null)) {
            return $this->error(164);
        }
        if (! preg_match('/^\d{2,}/', (string) ($item['adgCode'] ?? ''))) {
            return $this->error(183);
        }
        $quantity = $item['quantity'] ?? null;
        if (! is_numeric($quantity) || $quantity <= 0 || round((float) $quantity, 3) != (float) $quantity) {
            return $this->error(181, 'Ապրանքի քանակը պետք է լինի դրական, ստորակետից հետո առավելագույնը 3 նիշ');
        }
        $price = $item['price'] ?? null;
        if (! is_numeric($price) || $price <= 0 || round((float) $price, 2) != (float) $price) {
            return $this->error(165);
        }
        if (EhdmMath::lineTotal($item) <= 0) {
            return $this->error(160, 'Զեղչից հետո տողի գումարը պետք է լինի դրական');
        }

        return null;
    }

    private function result(array $receipt): array
    {
        $result = [
            'receiptId' => $receipt['receiptId'],
            'crn' => $this->crn(),
            'sn' => $this->serial(),
            'tin' => $this->entry->einvoice_tin ?: '00000000',
            'taxpayer' => '«'.$this->entry->name.'» (ՓՈՐՁԱՐԿՈՒՄ)',
            'address' => 'Փորձարկման ռեժիմ, կտրոնը ՊԵԿ չի ուղարկվել',
            'time' => $receipt['time'],
            'fiscal' => $receipt['fiscal'],
            'total' => (float) $receipt['total'],
            'change' => (float) $receipt['change'],
        ];
        $result['qr'] = EhdmMath::qr($result + $receipt);

        return $result;
    }

    private function serial(): string
    {
        return 'MOCK'.strtoupper(substr(md5($this->crn()), 0, 4));
    }

    private function original(array $body): ?array
    {
        return $this->state['receipts'][(string) ($body['receiptId'] ?? '')] ?? null;
    }

    private function printCopy(array $body): array
    {
        $receipt = $this->original($body);

        return is_array($receipt) ? $this->ok($this->result($receipt)) : $this->error(176);
    }

    private function returnedInfo(array $body): array
    {
        $receipt = $this->original($body);
        if (! is_array($receipt)) {
            return $this->error(176);
        }
        if ($receipt['type'] !== 'SALE') {
            return $this->error(182);
        }

        return $this->ok([
            'cashierId' => $receipt['cashierId'],
            'cardAmount' => (float) $receipt['card'],
            'cashAmount' => (float) $receipt['cash'],
            'partnerTin' => $receipt['partnerTin'],
            'partialAmount' => (float) $receipt['partial'],
            'prePayment' => (float) $receipt['prepayment'],
            'saleType' => 2,
            'receiptType' => 0,
            'receiptSubType' => 1,
            'totalAmount' => (float) $receipt['total'],
            'time' => $receipt['time'],
            'items' => array_map(fn (array $row) => [
                'receiptProductId' => $row['receiptProductId'],
                'quantity' => round((float) $row['quantity'] - $row['returned'], 3),
                'dep' => (int) ($row['dep'] ?? 1),
                'vat' => $row['taxRegime'] === 1 ? 16.67 : 0.0,
                'taxRegime' => $row['taxRegime'],
                'goodCode' => $row['goodCode'],
                'goodName' => $row['goodName'],
                'adgCode' => $row['adgCode'],
                'unit' => $row['unit'],
                'price' => (float) $row['price'],
                'totalWithoutTaxes' => $row['taxRegime'] === 1 ? EhdmMath::money($row['total'] / 1.2) : (float) $row['total'],
                'totalWithTaxes' => (float) $row['total'],
            ], $receipt['items']),
        ]);
    }

    private function printReturn(array $body): array
    {
        $receipt = $this->original($body);
        if (! is_array($receipt)) {
            return $this->error(176);
        }
        if ($receipt['type'] !== 'SALE') {
            return $this->error(182);
        }

        $left = array_sum(array_map(fn ($row) => (float) $row['quantity'] - $row['returned'], $receipt['items']));
        if ($left <= 0) {
            return $this->error(158);
        }

        $list = $body['returnItemList'] ?? null;
        if (! is_array($list) || $list === []) {
            return $this->error(105, 'returnItemList դաշտը դատարկ է');
        }

        $amount = 0.0;
        foreach ($list as $line) {
            $id = $line['receiptProductId'] ?? null;
            $row = is_int($id) ? ($receipt['items'][$id] ?? null) : null;
            if (! $row) {
                return $this->error(163);
            }
            $quantity = (float) ($line['quantity'] ?? 0);
            if ($quantity <= 0 || $quantity > round((float) $row['quantity'] - $row['returned'], 3) + 1e-9) {
                return $this->error(181, 'Վերադարձվող քանակը գերազանցում է մնացած քանակը ('.$row['goodName'].')');
            }
            $amount += $row['total'] / (float) $row['quantity'] * $quantity;
        }
        $amount = EhdmMath::money($amount);

        $cash = (float) ($body['cashAmountForReturn'] ?? 0);
        $card = (float) ($body['cardAmountForReturn'] ?? 0);
        if ($cash < 0 || $card < 0 || abs(EhdmMath::money($cash + $card) - $amount) > 0.01) {
            return $this->error(178, 'Վերադարձվող գումարը պետք է լինի '.number_format($amount, 2, '.', ''));
        }

        foreach ($list as $line) {
            $this->state['receipts'][$receipt['receiptId']]['items'][$line['receiptProductId']]['returned'] += (float) $line['quantity'];
        }

        $return = [
            'receiptId' => (string) $this->state['next']++,
            'type' => 'RETURN',
            'cashierId' => $receipt['cashierId'],
            'partnerTin' => $receipt['partnerTin'],
            'cash' => $cash,
            'card' => $card,
            'partial' => 0.0,
            'prepayment' => 0.0,
            'total' => $amount,
            'change' => 0.0,
            'time' => (int) floor(microtime(true) * 1000),
            'fiscal' => null,
            'items' => [],
        ];
        $this->state['receipts'][$return['receiptId']] = $return;

        return $this->ok($this->result($return));
    }
}
