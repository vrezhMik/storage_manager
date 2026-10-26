<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->string('api_abc')->nullable()->after('api_frozen_stock');
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->dropColumn('api_abc');
        });
    }
};
