ALTER TABLE "payroll_records"
  DROP CONSTRAINT "payroll_records_check1",
  ADD CONSTRAINT "payroll_records_net_invariant" CHECK (
    "overtime_pay" >= 0
    AND "attendance_deduction" >= 0
    AND "net" = "base" + "allowances" + "bonus" + "overtime_pay"
      - "deductions" - "attendance_deduction" - "advance_recovery"
  );
