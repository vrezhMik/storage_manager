<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->string('api_overdue_debts')->nullable()->after('api_abc');
            $table->string('api_sales_monthly')->nullable()->after('api_overdue_debts');
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->dropColumn(['api_overdue_debts', 'api_sales_monthly']);
        });
    }
};
