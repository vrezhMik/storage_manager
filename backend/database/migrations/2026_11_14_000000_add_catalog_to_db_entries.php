<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Sales product picker: groups, names, prices and pictures from the
        // company's WooCommerce site; stock, unit and classifier code from 1C.
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('catalog_url')->nullable();
            $table->string('api_stock')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn(['catalog_url', 'api_stock']);
        });
    }
};
