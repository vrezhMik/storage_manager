<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Documents the AI assistant searches in: a web page or an uploaded file.
        Schema::create('kb_sources', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('type', 10); // url | file
            $table->string('url', 2048)->nullable();
            $table->string('file_path')->nullable();
            $table->string('status', 20)->default('pending'); // pending | indexed | failed
            $table->text('error')->nullable();
            $table->unsignedInteger('chunks_count')->default(0);
            $table->timestamp('indexed_at')->nullable();
            $table->timestamps();
        });

        // Text pieces of a source with their embedding (float32 vector, packed).
        Schema::create('kb_chunks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kb_source_id')->constrained('kb_sources')->cascadeOnDelete();
            $table->unsignedInteger('position');
            $table->string('heading', 500)->nullable();
            $table->text('content');
            $table->binary('embedding');
            $table->timestamps();
        });

        // Off by default: the assistant is in testing.
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('can_assistant')->default(false)->after('can_dashboard');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('can_assistant');
        });
        Schema::dropIfExists('kb_chunks');
        Schema::dropIfExists('kb_sources');
    }
};
