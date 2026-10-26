<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('can_documents_in')->default(true)->after('allow_manual_text_input');
            $table->boolean('can_documents_out')->default(true)->after('can_documents_in');
            $table->boolean('can_reports')->default(true)->after('can_documents_out');
            $table->boolean('can_price_check')->default(true)->after('can_reports');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['can_documents_in', 'can_documents_out', 'can_reports', 'can_price_check']);
        });
    }
};
