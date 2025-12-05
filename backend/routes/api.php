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

Route::middleware('auth.jwt')->get('orders', [OrderController::class, 'index']);
Route::middleware('auth.jwt')->get('purchases', [OrderController::class, 'purchases']);
