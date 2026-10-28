<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Armenian translation of chunks written in another language (e.g. Russian ITS pages).
        Schema::table('kb_chunks', function (Blueprint $table) {
            $table->text('content_hy')->nullable()->after('content');
        });

        Schema::table('kb_sources', function (Blueprint $table) {
            $table->string('translation_status', 20)->nullable()->after('indexed_at'); // pending | done | failed | not_needed
            $table->text('translation_error')->nullable()->after('translation_status');
            $table->timestamp('translated_at')->nullable()->after('translation_error');
        });
    }

    public function down(): void
    {
        Schema::table('kb_sources', function (Blueprint $table) {
            $table->dropColumn(['translation_status', 'translation_error', 'translated_at']);
        });
        Schema::table('kb_chunks', function (Blueprint $table) {
            $table->dropColumn('content_hy');
        });
    }
};
