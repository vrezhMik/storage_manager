<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The company's electronic cash register (էլեկտրոնային ՀԴՄ) at the tax
        // service. The tax service only accepts its requests from the IP given
        // in the registration, with the certificate it issued.
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('ehdm_mode', 8)->default('off')->after('einvoice_password');
            $table->string('ehdm_crn', 32)->nullable()->after('ehdm_mode');
            $table->unsignedSmallInteger('ehdm_dep')->default(1)->after('ehdm_crn');
            $table->text('ehdm_cert')->nullable()->after('ehdm_dep');
            $table->text('ehdm_cert_password')->nullable()->after('ehdm_cert');
            $table->unsignedBigInteger('ehdm_seq')->default(0)->after('ehdm_cert_password');
        });

        // The cashier number printed on the user's receipts.
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedInteger('ehdm_cashier_id')->nullable()->after('nikita_phone');
        });

        // Every receipt printed from the terminal, with the tax service's answer.
        Schema::create('ehdm_receipts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('db_entry_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('return_of_id')->nullable()->constrained('ehdm_receipts')->nullOnDelete();
            $table->string('type', 8);
            $table->string('mode', 8);
            $table->string('status', 8);
            $table->string('crn', 32)->nullable();
            $table->string('receipt_id', 32)->nullable();
            $table->string('fiscal', 32)->nullable();
            $table->string('sn', 32)->nullable();
            $table->string('partner_tin', 8)->nullable();
            $table->decimal('cash_amount', 15, 2)->default(0);
            $table->decimal('card_amount', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->decimal('change', 15, 2)->default(0);
            $table->text('qr')->nullable();
            $table->timestamp('printed_at')->nullable();
            $table->json('items');
            $table->json('response')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
            $table->index(['db_entry_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ehdm_receipts');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('ehdm_cashier_id');
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn(['ehdm_mode', 'ehdm_crn', 'ehdm_dep', 'ehdm_cert', 'ehdm_cert_password', 'ehdm_seq']);
        });
    }
};
