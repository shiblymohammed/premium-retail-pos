ALTER TABLE "payroll_records"
  ADD COLUMN "overtime_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "attendance_deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "attendance_basis" JSONB;
ALTER TABLE "loans"
  ADD COLUMN "monthly_installment" DECIMAL(12,2),
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'LOAN',
  ADD CONSTRAINT "loans_schedule_check" CHECK (
    "kind" IN ('LOAN', 'ADVANCE') AND ("monthly_installment" IS NULL OR "monthly_installment" > 0)
  );
ALTER TABLE "repayments" ADD COLUMN "payroll_id" TEXT;
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_payroll_id_fkey"
  FOREIGN KEY ("payroll_id") REFERENCES "payroll_records" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "repayments_payroll_id_loan_id_key" ON "repayments" ("payroll_id", "loan_id");
ALTER TABLE "loans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "repayments" ENABLE ROW LEVEL SECURITY;
