-- Phase 5: replenishment drafts, transfer reconciliation, and cancellation audit.
-- IF NOT EXISTS guards allow recovery after Prisma stopped a previous partial attempt.
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_CANCELLATION';

DO $$ BEGIN
  CREATE TYPE "ReplenishmentStatus" AS ENUM ('DRAFT', 'REJECTED', 'TRANSFER_CREATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "transfers"
  ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

ALTER TABLE "transfer_lines"
  ADD COLUMN IF NOT EXISTS "system_suggested_qty_base" INTEGER,
  ADD COLUMN IF NOT EXISTS "approved_qty_base" INTEGER,
  ADD COLUMN IF NOT EXISTS "dispatched_qty_base" INTEGER,
  ADD COLUMN IF NOT EXISTS "received_qty_base" INTEGER,
  ADD COLUMN IF NOT EXISTS "discrepancy_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "units_per_carton" INTEGER,
  ADD COLUMN IF NOT EXISTS "base_unit_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "short_qty_base" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "damaged_qty_base" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "excess_qty_base" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "replenishment_requests" (
  "id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL,
  "source_location_id" TEXT NOT NULL,
  "dest_location_id" TEXT NOT NULL,
  "status" "ReplenishmentStatus" NOT NULL DEFAULT 'DRAFT',
  "generated_by_user_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "rejected_by_user_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "transfer_id" TEXT,
  CONSTRAINT "replenishment_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "replenishment_request_lines" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "available_qty_base" INTEGER NOT NULL,
  "reorder_level_base" INTEGER NOT NULL,
  "system_suggested_qty_base" INTEGER NOT NULL,
  "manager_approved_qty_base" INTEGER,
  "units_per_carton" INTEGER,
  "base_unit_snapshot" TEXT,
  CONSTRAINT "replenishment_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "replenishment_requests_request_number_key" ON "replenishment_requests"("request_number");
CREATE UNIQUE INDEX IF NOT EXISTS "replenishment_requests_idempotency_key_key" ON "replenishment_requests"("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "replenishment_requests_transfer_id_key" ON "replenishment_requests"("transfer_id");
CREATE INDEX IF NOT EXISTS "replenishment_requests_dest_location_id_status_created_at_idx" ON "replenishment_requests"("dest_location_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "replenishment_requests_source_location_id_status_created_at_idx" ON "replenishment_requests"("source_location_id", "status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "replenishment_request_lines_request_id_variant_id_key" ON "replenishment_request_lines"("request_id", "variant_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_cancelled_by_user_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_source_location_id_fkey') THEN
    ALTER TABLE "replenishment_requests" ADD CONSTRAINT "replenishment_requests_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_dest_location_id_fkey') THEN
    ALTER TABLE "replenishment_requests" ADD CONSTRAINT "replenishment_requests_dest_location_id_fkey" FOREIGN KEY ("dest_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_generated_by_user_id_fkey') THEN
    ALTER TABLE "replenishment_requests" ADD CONSTRAINT "replenishment_requests_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_approved_by_user_id_fkey') THEN
    ALTER TABLE "replenishment_requests" ADD CONSTRAINT "replenishment_requests_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_rejected_by_user_id_fkey') THEN
    ALTER TABLE "replenishment_requests" ADD CONSTRAINT "replenishment_requests_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_transfer_id_fkey') THEN
    ALTER TABLE "replenishment_requests" ADD CONSTRAINT "replenishment_requests_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_request_lines_request_id_fkey') THEN
    ALTER TABLE "replenishment_request_lines" ADD CONSTRAINT "replenishment_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "replenishment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_request_lines_variant_id_fkey') THEN
    ALTER TABLE "replenishment_request_lines" ADD CONSTRAINT "replenishment_request_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
