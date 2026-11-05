<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Off by default: the retail block is opened per user. Each store has
        // its own user; retail_store is that store's name in 1C (empty = all).
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('can_retail')->default(false)->after('can_assistant');
            $table->string('retail_store')->nullable()->after('can_retail');
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('api_retail_plan')->nullable()->after('api_sales_monthly');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['can_retail', 'retail_store']);
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn('api_retail_plan');
        });
    }
};
