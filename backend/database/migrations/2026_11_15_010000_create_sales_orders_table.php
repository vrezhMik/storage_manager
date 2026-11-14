<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Sales made in the terminal: kept as drafts, then sent to 1C as a
        // customer order (Заказ клиента).
        Schema::create('sales_orders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('db_entry_id')->constrained()->cascadeOnDelete();
            $table->string('status', 16)->default('DRAFT');
            $table->string('buyer_tin', 8)->nullable();
            $table->string('buyer_name');
            $table->string('buyer_address')->nullable();
            $table->date('delivered_at')->nullable();
            $table->text('comment')->nullable();
            $table->json('items');
            $table->decimal('total', 15, 2)->default(0);
            $table->string('onec_number')->nullable();
            $table->string('onec_ref')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->index(['db_entry_id', 'user_id', 'created_at']);
        });

        Schema::table('db_entries', function (Blueprint $table): void {
            $table->string('api_sales_order')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('db_entries', function (Blueprint $table): void {
            $table->dropColumn('api_sales_order');
        });

        Schema::dropIfExists('sales_orders');
    }
};
