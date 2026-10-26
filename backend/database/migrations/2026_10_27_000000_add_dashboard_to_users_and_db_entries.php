<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Off by default: the dashboard is meant for management only.
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('can_dashboard')->default(false)->after('can_price_check');
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('api_dashboard')->nullable()->after('api_debts');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('can_dashboard');
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn('api_dashboard');
        });
    }
};
