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
    ];
}
