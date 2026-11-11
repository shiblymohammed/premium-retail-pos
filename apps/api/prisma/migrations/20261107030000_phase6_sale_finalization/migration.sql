ALTER TABLE "companies"
ADD COLUMN "invoice_sequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "invoices"
ADD COLUMN "bill_discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "companies"
ADD CONSTRAINT "companies_invoice_sequence_nonnegative_check" CHECK ("invoice_sequence" >= 0);

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_discount_totals_nonnegative_check" CHECK (
  "discount_total" >= 0 AND "bill_discount_total" >= 0 AND "bill_discount_total" <= "discount_total"
);
