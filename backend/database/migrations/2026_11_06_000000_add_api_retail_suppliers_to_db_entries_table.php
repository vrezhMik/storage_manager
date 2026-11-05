<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('api_retail_suppliers')->nullable()->after('api_retail_plan');
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn('api_retail_suppliers');
        });
    }
};
