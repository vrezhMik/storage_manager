<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('db_entries', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('username');
            $table->string('password');
            $table->string('api_get_purchase');
            $table->string('api_get_orders');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('db_entries');
    }
};
