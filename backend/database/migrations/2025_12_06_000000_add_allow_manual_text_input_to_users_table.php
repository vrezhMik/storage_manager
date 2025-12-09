<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table
                ->boolean('allow_manual_text_input')
                ->default(true)
                ->after('allow_manual_items')
                ->comment('Controls whether users can type barcode values manually');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('allow_manual_text_input');
        });
    }
};
