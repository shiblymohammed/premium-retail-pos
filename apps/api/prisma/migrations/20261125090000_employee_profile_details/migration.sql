ALTER TABLE "employees"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "designation" TEXT,
  ADD COLUMN "monthly_base_salary" DECIMAL(12, 2),
  ADD CONSTRAINT "employees_monthly_base_salary_nonnegative"
    CHECK ("monthly_base_salary" >= 0);
