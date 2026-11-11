ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_amounts_reconcile_check" CHECK (
  "gross_total" >= 0 AND "net_total" >= 0 AND
  "discount_total" >= 0 AND "discount_total" <= "gross_total" AND
  "gross_total" - "discount_total" = "net_total"
);
