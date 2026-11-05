<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The user's own CoSign (cloud e-signature) account: a signature belongs
        // to a person, not to the company. The password is stored encrypted.
        Schema::table('users', function (Blueprint $table): void {
            $table->string('cosign_username')->nullable()->after('can_sales');
            $table->text('cosign_password')->nullable()->after('cosign_username');
        });

        Schema::table('einvoice_documents', function (Blueprint $table): void {
            $table->timestamp('signed_at')->nullable()->after('serial_no');
        });
    }

    public function down(): void
    {
        Schema::table('einvoice_documents', function (Blueprint $table): void {
            $table->dropColumn('signed_at');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['cosign_username', 'cosign_password']);
        });
    }
};
