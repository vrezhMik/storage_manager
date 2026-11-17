<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Problems people register on flexit.am ("Խնդրի գրանցում"), clients or not.
        // Each one is posted to the team's Telegram chat to be picked up quickly.
        Schema::create('support_tickets', function (Blueprint $table): void {
            $table->id();
            $table->uuid('token')->unique();
            $table->string('status', 16)->default('new');
            $table->string('name');
            $table->string('phone', 32);
            $table->string('company')->nullable();
            $table->string('tin', 8)->nullable();
            $table->string('product', 64);
            $table->boolean('urgent')->default(false);
            $table->text('description');
            $table->json('attachments')->nullable();
            $table->string('assignee')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->text('notes')->nullable();
            $table->string('source')->nullable();
            $table->string('ip', 45)->nullable();
            $table->bigInteger('telegram_message_id')->nullable();
            $table->timestamp('taken_at')->nullable();
            $table->timestamp('solved_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_tickets');
    }
};
