-- AlterTable
ALTER TABLE "supplier_receipts" ADD COLUMN     "purchase_order_id" TEXT;

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("order_id","variant_id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_accounts" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "customer_credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_entries" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_location_id_number_key" ON "purchase_orders"("location_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_order_id_reference_key" ON "supplier_payments"("order_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "customer_credit_accounts_location_id_code_key" ON "customer_credit_accounts"("location_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_credit_entries_account_id_reference_key" ON "customer_credit_entries"("account_id", "reference");

-- CreateIndex
CREATE INDEX "supplier_receipts_purchase_order_id_idx" ON "supplier_receipts"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "supplier_receipts" ADD CONSTRAINT "supplier_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_accounts" ADD CONSTRAINT "customer_credit_accounts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "customer_credit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines" ADD CHECK ("quantity" > 0 AND "unit_cost" >= 0);
ALTER TABLE "supplier_payments" ADD CHECK ("amount" > 0);
ALTER TABLE "customer_credit_entries" ADD CHECK ("amount" > 0 AND "kind" IN ('CHARGE', 'PAYMENT', 'CREDIT'));
