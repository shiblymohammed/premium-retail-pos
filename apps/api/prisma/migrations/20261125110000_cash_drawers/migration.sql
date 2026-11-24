CREATE TABLE "cash_drawer_sessions" (
  "id" TEXT PRIMARY KEY,
  "operator_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "location_id" TEXT NOT NULL REFERENCES "locations"("id") ON DELETE RESTRICT,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "opening_cash" DECIMAL(12,2) NOT NULL CHECK ("opening_cash" >= 0),
  "counted_cash" DECIMAL(12,2) CHECK ("counted_cash" >= 0),
  "counted_card" DECIMAL(12,2),
  "expected_cash" DECIMAL(14,2),
  "expected_card" DECIMAL(14,2)
);
CREATE UNIQUE INDEX "cash_drawers_one_open" ON "cash_drawer_sessions"("operator_id", "location_id") WHERE "closed_at" IS NULL;
CREATE INDEX "cash_drawers_operator_history" ON "cash_drawer_sessions"("operator_id", "location_id", "opened_at");
ALTER TABLE "invoice_payments" ADD COLUMN "cash_drawer_id" TEXT REFERENCES "cash_drawer_sessions"("id") ON DELETE RESTRICT;
ALTER TABLE "invoice_refunds" ADD COLUMN "cash_drawer_id" TEXT REFERENCES "cash_drawer_sessions"("id") ON DELETE RESTRICT;
CREATE INDEX "invoice_payments_cash_drawer_id_idx" ON "invoice_payments"("cash_drawer_id");
CREATE INDEX "invoice_refunds_cash_drawer_id_idx" ON "invoice_refunds"("cash_drawer_id");
