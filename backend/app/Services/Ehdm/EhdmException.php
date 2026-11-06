<?php

namespace App\Services\Ehdm;

use RuntimeException;

/**
 * An e-ՀԴՄ problem whose message can be shown to the terminal user.
 * $ehdmCode / $ehdmMessage are the tax service's code and constant
 * (e.g. 152 PAID_AMOUNT_LESS_THAN_TOTAL) when it answered with an error.
 */
class EhdmException extends RuntimeException
{
    public function __construct(string $message, public readonly ?int $ehdmCode = null, public readonly ?string $ehdmMessage = null)
    {
        parent::__construct($message);
    }
}
