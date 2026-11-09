<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The company's network (public IPs, one per line).
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->text('allowed_ips')->nullable();
        });

        // Marked users open Retail and Price check only from that network.
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('network_restricted')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('network_restricted');
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn('allowed_ips');
        });
    }
};
