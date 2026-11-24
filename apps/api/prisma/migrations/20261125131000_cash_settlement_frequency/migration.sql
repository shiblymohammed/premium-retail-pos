ALTER TABLE "companies" ADD COLUMN "cash_settlement_frequency" TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE "companies" ADD CONSTRAINT "company_cash_settlement_frequency_valid"
  CHECK ("cash_settlement_frequency" IN ('daily', 'weekly', 'monthly'));
