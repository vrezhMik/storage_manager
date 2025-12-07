<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->string('api_post_purchases')->nullable()->after('api_post_orders');
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table) {
            $table->dropColumn('api_post_purchases');
        });
    }
};
