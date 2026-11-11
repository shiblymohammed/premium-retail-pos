-- Invoice numbers are globally unique while invoice counters are maintained per company.
-- Require a distinct company prefix so their independently incremented sequences cannot collide.
CREATE UNIQUE INDEX "companies_invoice_prefix_key" ON "companies"("invoice_prefix");
