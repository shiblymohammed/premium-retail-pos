-- Require canonical stock units at the application boundary, and make the
-- product/packaging invariants hold even if data is written outside the API.
ALTER TABLE "products" ALTER COLUMN "base_unit" DROP DEFAULT;
ALTER TABLE "products" ADD COLUMN "has_variants" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products"
  ADD CONSTRAINT "products_base_unit_not_blank_check"
  CHECK (length(btrim("base_unit")) > 0);
ALTER TABLE "products"
  ADD CONSTRAINT "products_units_per_carton_positive_check"
  CHECK ("units_per_carton" IS NULL OR "units_per_carton" > 0);

-- SKU and barcode identifiers are case-insensitive; keep the Prisma unique
-- indexes and enforce normalized uniqueness for direct SQL writers as well.
CREATE UNIQUE INDEX "variants_sku_normalized_key" ON "variants" (lower("sku"));
CREATE UNIQUE INDEX "variants_barcode_normalized_key" ON "variants" (lower("barcode"))
  WHERE "barcode" IS NOT NULL;

ALTER TABLE "price_change_logs"
  ADD CONSTRAINT "price_change_logs_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "price_change_logs_product_id_created_at_idx"
  ON "price_change_logs"("product_id", "created_at");
CREATE INDEX "price_change_logs_changed_by_user_id_created_at_idx"
  ON "price_change_logs"("changed_by_user_id", "created_at");
