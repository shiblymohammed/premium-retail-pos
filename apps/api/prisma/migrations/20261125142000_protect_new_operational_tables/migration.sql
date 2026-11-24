-- These tables are written by the POS API's database role.
-- Browser-side Supabase roles cannot read them through the Data API.
ALTER TABLE "payroll_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_credit_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_credit_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_breaks" ENABLE ROW LEVEL SECURITY;
