<?php

namespace App\Services\Ehdm;

/**
 * Receipt sums as the tax service counts them: money to 2 decimals (0.005
 * rounds up), quantities to 3 decimals.
 */
class EhdmMath
{
    public const DISCOUNT_PERCENT = 1;

    public const DISCOUNT_PER_UNIT = 2;

    public const DISCOUNT_TOTAL = 4;

    public const ADDITIONAL_PERCENT = 8;

    public const ADDITIONAL_AMOUNT = 16;

    public static function money(float $value): float
    {
        return round($value + ($value >= 0 ? 1e-9 : -1e-9), 2);
    }

    /**
     * The line total after its discounts.
     *
     * @param  array{price: float|int, quantity: float|int, discount?: float|int|null, discountType?: int|null, additionalDiscount?: float|int|null, additionalDiscountType?: int|null}  $item
     */
    public static function lineTotal(array $item): float
    {
        $price = (float) $item['price'];
        $quantity = (float) $item['quantity'];
        $discount = (float) ($item['discount'] ?? 0);

        $total = match ((int) ($item['discountType'] ?? 0)) {
            self::DISCOUNT_PERCENT => self::money($price * $quantity * (1 - $discount / 100)),
            self::DISCOUNT_PER_UNIT => self::money(($price - $discount) * $quantity),
            self::DISCOUNT_TOTAL => self::money($price * $quantity - $discount),
            default => self::money($price * $quantity),
        };

        $additional = (float) ($item['additionalDiscount'] ?? 0);

        return match ((int) ($item['additionalDiscountType'] ?? 0)) {
            self::ADDITIONAL_PERCENT => self::money($total * (1 - $additional / 100)),
            self::ADDITIONAL_AMOUNT => self::money($total - $additional),
            default => $total,
        };
    }

    public static function total(array $items): float
    {
        return self::money(array_sum(array_map(fn (array $item) => self::lineTotal($item), $items)));
    }

    /**
     * The receipt's QR text: TIN, CRN, SERIAL, Receipt_ID, Receipt_Time, FISCAL,
     * TOTAL_CASH, TOTAL_NONCASH, PREP_USAGE, PARTIAL, TOTAL.
     */
    public static function qr(array $r): string
    {
        $amount = fn ($v) => number_format((float) $v, fmod((float) $v, 1.0) == 0.0 ? 0 : 2, '.', ',');

        return 'TIN: '.$r['tin'].', CRN: '.$r['crn'].', SERIAL: '.$r['sn'].', Receipt_ID: '.$r['receiptId']
            .', Receipt_Time: '.gmdate('n/j/y g:i A', intdiv((int) $r['time'], 1000))
            .', FISCAL: '.($r['fiscal'] ?? 'null')
            .', TOTAL_CASH: '.$amount($r['cash']).', TOTAL_NONCASH: '.$amount($r['card'])
            .', PREP_USAGE: '.$amount($r['prepayment'] ?? 0).', PARTIAL: '.$amount($r['partial'] ?? 0)
            .', TOTAL: '.$amount($r['total']);
    }
}
