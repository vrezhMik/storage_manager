<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
    ];
}
