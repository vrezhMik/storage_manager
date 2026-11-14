<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Sales buyer picker: the company's partners (TIN, name, address) from 1C,
        // each user's own when 1C's "Основной менеджер" is given.
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('api_partners')->nullable();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->string('partners_manager')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('partners_manager');
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn('api_partners');
        });
    }
};
