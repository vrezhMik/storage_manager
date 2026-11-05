<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Off by default: issuing tax documents is opened per user.
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('can_sales')->default(false)->after('retail_store');
        });

        // The company's e-invoicing (taxservice.am) account. The password is
        // stored encrypted and never sent to the browser.
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('einvoice_tin', 8)->nullable()->after('api_retail_suppliers');
            $table->string('einvoice_login')->nullable()->after('einvoice_tin');
            $table->text('einvoice_password')->nullable()->after('einvoice_login');
        });

        // Every document sent from the terminal, with the tax service's answer.
        Schema::create('einvoice_documents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('db_entry_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 32);
            $table->string('status', 32);
            $table->uuid('src_id')->nullable();
            $table->string('serial_no')->nullable();
            $table->string('buyer_tin', 8)->nullable();
            $table->string('buyer_name')->nullable();
            $table->date('delivered_at')->nullable();
            $table->decimal('total', 15, 2)->default(0);
            $table->json('items');
            $table->text('error')->nullable();
            $table->json('response')->nullable();
            $table->timestamps();
            $table->index(['db_entry_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('einvoice_documents');

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn(['einvoice_tin', 'einvoice_login', 'einvoice_password']);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('can_sales');
        });
    }
};
