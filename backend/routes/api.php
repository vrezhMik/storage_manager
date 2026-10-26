<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\OrderController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login']);
    Route::post('refresh', [AuthController::class, 'refresh']);
    Route::post('logout', [AuthController::class, 'logout']);
    Route::middleware('auth.jwt')->get('me', [AuthController::class, 'me']);
});

Route::middleware(['auth.jwt', 'section:documents_out'])->get('orders', [OrderController::class, 'index']);
Route::middleware(['auth.jwt', 'section:documents_out'])->post('orders', [OrderController::class, 'store']);
Route::middleware(['auth.jwt', 'section:documents_in'])->get('purchases', [OrderController::class, 'purchases']);
Route::middleware(['auth.jwt', 'section:documents_in'])->post('purchases', [OrderController::class, 'storePurchase']);
Route::middleware(['auth.jwt', 'section:price_check'])->get('price-check', [OrderController::class, 'priceCheck']);
Route::middleware(['auth.jwt', 'section:reports'])->get('sales', [OrderController::class, 'sales']);
Route::middleware(['auth.jwt', 'section:reports'])->get('sales-by-warehouse', [OrderController::class, 'salesByWarehouse']);
Route::middleware(['auth.jwt', 'section:reports'])->get('debts', [OrderController::class, 'debts']);
Route::middleware(['auth.jwt', 'section:dashboard'])->get('dashboard', [OrderController::class, 'dashboard']);
Route::middleware(['auth.jwt', 'section:reports'])->get('frozen-stock', [OrderController::class, 'frozenStock']);
Route::middleware(['auth.jwt', 'section:reports'])->get('abc', [OrderController::class, 'abc']);
Route::middleware(['auth.jwt', 'section:reports'])->get('overdue-debts', [OrderController::class, 'overdueDebts']);
Route::middleware(['auth.jwt', 'section:reports'])->get('sales-monthly', [OrderController::class, 'salesMonthly']);
