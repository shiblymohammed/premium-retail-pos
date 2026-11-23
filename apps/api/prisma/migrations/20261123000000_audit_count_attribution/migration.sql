ALTER TABLE "audit_count_items"
  ADD COLUMN "counted_by_user_id" TEXT,
  ADD COLUMN "counted_at" TIMESTAMP(3),
  ADD COLUMN "recounted_by_user_id" TEXT,
  ADD COLUMN "recounted_at" TIMESTAMP(3),
  ADD COLUMN "recount_request_reason" VARCHAR(500);

ALTER TABLE "audit_count_items"
  ADD CONSTRAINT "audit_count_items_counted_by_user_id_fkey"
    FOREIGN KEY ("counted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_count_items_recounted_by_user_id_fkey"
    FOREIGN KEY ("recounted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_count_items_counted_by_user_id_idx" ON "audit_count_items"("counted_by_user_id");
CREATE INDEX "audit_count_items_recounted_by_user_id_idx" ON "audit_count_items"("recounted_by_user_id");
