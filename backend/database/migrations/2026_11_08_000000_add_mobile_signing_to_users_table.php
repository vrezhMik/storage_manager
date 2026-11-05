<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Signing on the phone: Mobile ID (SIM) or the Nikita app. Only the
        // phone number is kept; the signer confirms on the phone.
        Schema::table('users', function (Blueprint $table): void {
            $table->string('mobile_id_phone', 20)->nullable()->after('cosign_password');
            $table->string('nikita_phone', 20)->nullable()->after('mobile_id_phone');
        });

        // The tax service's sign task while a document is being signed.
        Schema::table('einvoice_documents', function (Blueprint $table): void {
            $table->uuid('sign_request_id')->nullable()->after('serial_no');
            $table->string('sign_method', 16)->nullable()->after('sign_request_id');
        });
    }

    public function down(): void
    {
        Schema::table('einvoice_documents', function (Blueprint $table): void {
            $table->dropColumn(['sign_request_id', 'sign_method']);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['mobile_id_phone', 'nikita_phone']);
        });
    }
};
