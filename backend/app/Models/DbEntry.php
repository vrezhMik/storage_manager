<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Symfony\Component\HttpFoundation\IpUtils;

class DbEntry extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'username',
        'password',
        'api_get_purchase',
        'api_get_orders',
        'api_post_orders',
        'api_post_purchases',
        'api_price_check',
        'api_sales',
        'api_sales_by_warehouse',
        'api_debts',
        'api_dashboard',
        'api_frozen_stock',
        'api_abc',
        'api_overdue_debts',
        'api_sales_monthly',
        'api_retail_plan',
        'api_retail_suppliers',
        'allowed_ips',
        'catalog_url',
        'api_stock',
        'api_partners',
        'einvoice_tin',
        'einvoice_login',
        'einvoice_password',
        'ehdm_mode',
        'ehdm_crn',
        'ehdm_dep',
        'ehdm_cert',
        'ehdm_cert_password',
    ];

    // The e-invoicing password never leaves the server.
    protected $hidden = [
        'einvoice_password',
        'ehdm_cert',
        'ehdm_cert_password',
    ];

    protected function casts(): array
    {
        return [
            'einvoice_password' => 'encrypted',
            'ehdm_cert' => 'encrypted',
            'ehdm_cert_password' => 'encrypted',
            'ehdm_dep' => 'integer',
            'ehdm_seq' => 'integer',
        ];
    }

    public function hasEinvoiceAccount(): bool
    {
        return filled($this->einvoice_tin) && filled($this->einvoice_login) && filled($this->einvoice_password);
    }

    /**
     * The electronic cash register can print: "mock" needs only the mode;
     * "test" and "live" need the register number and the certificate.
     */
    public function hasEhdm(): bool
    {
        return match ($this->ehdm_mode) {
            'mock' => true,
            'test', 'live' => filled($this->ehdm_crn) && filled($this->ehdm_cert),
            default => false,
        };
    }

    /**
     * Whether a request's IP is in the company's network (allowed_ips: IPs or
     * ranges like 203.0.113.0/24). An empty list allows nobody.
     */
    public function allowsIp(?string $ip): bool
    {
        $allowed = preg_split('/[\s,;]+/', (string) $this->allowed_ips, -1, PREG_SPLIT_NO_EMPTY);

        return $ip !== null && IpUtils::checkIp($ip, $allowed);
    }
}
