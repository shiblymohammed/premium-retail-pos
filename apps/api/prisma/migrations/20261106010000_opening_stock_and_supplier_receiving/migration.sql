CREATE TABLE "opening_stock_imports" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "imported_by_user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "opening_stock_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_receipts" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "received_by_user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_receipt_lines" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "cartons" INTEGER NOT NULL DEFAULT 0,
    "loose_base_units" INTEGER NOT NULL,
    "units_per_carton" INTEGER,
    "quantity_base_units" INTEGER NOT NULL,
    CONSTRAINT "supplier_receipt_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_receipt_lines_cartons_nonnegative_check" CHECK ("cartons" >= 0),
    CONSTRAINT "supplier_receipt_lines_loose_nonnegative_check" CHECK ("loose_base_units" >= 0),
    CONSTRAINT "supplier_receipt_lines_quantity_positive_check" CHECK ("quantity_base_units" > 0),
    CONSTRAINT "supplier_receipt_lines_ratio_positive_check" CHECK ("units_per_carton" IS NULL OR "units_per_carton" > 0)
);

CREATE UNIQUE INDEX "opening_stock_imports_idempotency_key_key" ON "opening_stock_imports"("idempotency_key");
CREATE INDEX "opening_stock_imports_location_id_created_at_idx" ON "opening_stock_imports"("location_id", "created_at");
CREATE UNIQUE INDEX "supplier_receipts_receipt_number_key" ON "supplier_receipts"("receipt_number");
CREATE UNIQUE INDEX "supplier_receipts_idempotency_key_key" ON "supplier_receipts"("idempotency_key");
CREATE INDEX "supplier_receipts_location_id_confirmed_at_idx" ON "supplier_receipts"("location_id", "confirmed_at");
CREATE UNIQUE INDEX "supplier_receipt_lines_receipt_id_variant_id_key" ON "supplier_receipt_lines"("receipt_id", "variant_id");

ALTER TABLE "opening_stock_imports" ADD CONSTRAINT "opening_stock_imports_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opening_stock_imports" ADD CONSTRAINT "opening_stock_imports_imported_by_user_id_fkey"
  FOREIGN KEY ("imported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_receipts" ADD CONSTRAINT "supplier_receipts_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_receipts" ADD CONSTRAINT "supplier_receipts_received_by_user_id_fkey"
  FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_receipt_lines" ADD CONSTRAINT "supplier_receipt_lines_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "supplier_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_receipt_lines" ADD CONSTRAINT "supplier_receipt_lines_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
