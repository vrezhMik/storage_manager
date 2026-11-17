<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // People who sign in to the support portal on flexit.am (they used
        // Fluent Support before; their WordPress password hash is kept in
        // legacy_password until their first sign-in here).
        Schema::create('support_customers', function (Blueprint $table): void {
            $table->id();
            $table->string('first_name');
            $table->string('last_name')->nullable();
            $table->string('email')->unique();
            $table->string('phone', 32)->nullable();
            $table->string('company')->nullable();
            $table->string('tin', 8)->nullable();
            $table->boolean('contract')->default(false);
            $table->boolean('active')->default(true);
            $table->string('password')->nullable();
            $table->string('legacy_password')->nullable();
            $table->unsignedBigInteger('fluent_id')->nullable()->unique();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });

        Schema::create('support_customer_tokens', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('support_customer_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('support_password_resets', function (Blueprint $table): void {
            $table->string('email')->primary();
            $table->string('token', 64);
            $table->timestamp('created_at');
        });

        Schema::table('support_tickets', function (Blueprint $table): void {
            $table->foreignId('support_customer_id')->nullable()->after('token')->constrained()->nullOnDelete();
            $table->string('title')->nullable()->after('tin');
            $table->string('priority', 16)->default('normal')->after('urgent');
            $table->unsignedBigInteger('fluent_id')->nullable()->unique();
            $table->timestamp('closed_at')->nullable();
        });

        // The conversation under a ticket: the customer's and the team's replies.
        Schema::create('support_responses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('support_ticket_id')->constrained()->cascadeOnDelete();
            $table->string('author', 16);
            $table->string('author_name')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->json('attachments')->nullable();
            $table->unsignedBigInteger('fluent_id')->nullable()->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_responses');
        Schema::table('support_tickets', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('support_customer_id');
            $table->dropColumn(['title', 'priority', 'fluent_id', 'closed_at']);
        });
        Schema::dropIfExists('support_password_resets');
        Schema::dropIfExists('support_customer_tokens');
        Schema::dropIfExists('support_customers');
    }
};
