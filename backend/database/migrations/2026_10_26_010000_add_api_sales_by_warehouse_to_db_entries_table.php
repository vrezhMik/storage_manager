<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->string('api_sales_by_warehouse')->nullable()->after('api_sales');
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->dropColumn('api_sales_by_warehouse');
        });
    }
};
