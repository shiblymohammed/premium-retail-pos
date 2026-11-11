CREATE TYPE "RefundMethod" AS ENUM ('CASH', 'CARD', 'ONLINE', 'OTHER');
CREATE TYPE "RefundType" AS ENUM ('SALE_CANCELLATION', 'SALE_RETURN');
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCKED', 'QUARANTINED');

ALTER TABLE "sale_lines"
ADD COLUMN "bill_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "processed_by_user_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,
    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_return_lines" (
    "id" TEXT NOT NULL,
    "sale_return_id" TEXT NOT NULL,
    "sale_line_id" TEXT NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "refund_amount" DECIMAL(12,2) NOT NULL,
    "disposition" "ReturnDisposition" NOT NULL,
    "inspection_notes" VARCHAR(500),
    CONSTRAINT "sale_return_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_return_lines_quantity_positive_check" CHECK ("quantity_base_units" > 0),
    CONSTRAINT "sale_return_lines_amounts_check" CHECK (
      "gross_amount" >= 0 AND "discount_amount" >= 0 AND "refund_amount" >= 0 AND "refund_amount" <= "gross_amount"
    )
);

CREATE TABLE "invoice_refunds" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "sale_return_id" TEXT,
    "type" "RefundType" NOT NULL,
    "method" "RefundMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_reference" VARCHAR(120),
    "reason" VARCHAR(500) NOT NULL,
    "recorded_by_user_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_refunds_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "invoice_refunds_type_reference_check" CHECK (
      ("type" = 'SALE_CANCELLATION' AND "sale_return_id" IS NULL) OR
      ("type" = 'SALE_RETURN' AND "sale_return_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "sale_returns_return_number_key" ON "sale_returns"("return_number");
CREATE UNIQUE INDEX "sale_returns_idempotency_key_key" ON "sale_returns"("idempotency_key");
CREATE INDEX "sale_returns_invoice_id_processed_at_idx" ON "sale_returns"("invoice_id", "processed_at");
CREATE UNIQUE INDEX "sale_return_lines_sale_return_id_sale_line_id_key" ON "sale_return_lines"("sale_return_id", "sale_line_id");
CREATE INDEX "sale_return_lines_sale_line_id_idx" ON "sale_return_lines"("sale_line_id");
CREATE UNIQUE INDEX "invoice_refunds_sale_return_id_key" ON "invoice_refunds"("sale_return_id");
CREATE UNIQUE INDEX "invoice_refunds_one_cancellation_per_invoice_key" ON "invoice_refunds"("invoice_id") WHERE "type" = 'SALE_CANCELLATION';
CREATE INDEX "invoice_refunds_invoice_id_recorded_at_idx" ON "invoice_refunds"("invoice_id", "recorded_at");
CREATE INDEX "invoice_refunds_recorded_by_user_id_recorded_at_idx" ON "invoice_refunds"("recorded_by_user_id", "recorded_at");

ALTER TABLE "sale_returns"
ADD CONSTRAINT "sale_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "sale_returns_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_return_lines"
ADD CONSTRAINT "sale_return_lines_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "sale_return_lines_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_refunds"
ADD CONSTRAINT "invoice_refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "invoice_refunds_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "invoice_refunds_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
