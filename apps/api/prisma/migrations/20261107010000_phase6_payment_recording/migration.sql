CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'ONLINE');

CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "cash_tendered_amount" DECIMAL(12,2),
    "change_given_amount" DECIMAL(12,2),
    "transaction_reference" VARCHAR(120),
    "recorded_by_user_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_payments_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "invoice_payments_cash_reconciliation_check" CHECK (
      ("method" = 'CASH' AND "cash_tendered_amount" IS NOT NULL AND "change_given_amount" IS NOT NULL
        AND "cash_tendered_amount" >= "amount"
        AND "cash_tendered_amount" - "amount" = "change_given_amount")
      OR
      ("method" <> 'CASH' AND "cash_tendered_amount" IS NULL AND "change_given_amount" IS NULL)
    )
);

CREATE UNIQUE INDEX "invoice_payments_invoice_id_key" ON "invoice_payments"("invoice_id");
CREATE INDEX "invoice_payments_method_recorded_at_idx" ON "invoice_payments"("method", "recorded_at");
CREATE INDEX "invoice_payments_recorded_by_user_id_recorded_at_idx" ON "invoice_payments"("recorded_by_user_id", "recorded_at");

ALTER TABLE "invoice_payments"
ADD CONSTRAINT "invoice_payments_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_payments"
ADD CONSTRAINT "invoice_payments_recorded_by_user_id_fkey"
FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
