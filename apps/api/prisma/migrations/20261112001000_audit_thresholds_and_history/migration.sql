CREATE TABLE "audit_thresholds" (
    "scope_key" TEXT NOT NULL,
    "category_id" TEXT,
    "recount_variance_percent" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "recount_variance_units" INTEGER NOT NULL DEFAULT 5,
    "high_count_alert_qty" INTEGER,
    "updated_by_user_id" TEXT,
    "change_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_thresholds_pkey" PRIMARY KEY ("scope_key")
);

CREATE UNIQUE INDEX "audit_thresholds_category_id_key" ON "audit_thresholds"("category_id");
ALTER TABLE "audit_thresholds" ADD CONSTRAINT "audit_thresholds_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_count_items"
  ADD COLUMN "recount_threshold_percent" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN "recount_threshold_units" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "high_count_alert_qty" INTEGER,
  ADD COLUMN "high_count_alert" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "variance_percent" DECIMAL(8,3);

CREATE INDEX "audit_sessions_location_id_started_at_idx" ON "audit_sessions"("location_id", "started_at");
ALTER TABLE "audit_sessions" ADD CONSTRAINT "audit_sessions_initiated_by_user_id_fkey"
  FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_sessions" ADD CONSTRAINT "audit_sessions_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_terminal_audit_mutation() RETURNS trigger AS $$
DECLARE
  session_status "AuditSessionStatus";
BEGIN
  IF TG_TABLE_NAME = 'audit_sessions' THEN
    IF OLD."status" IN ('APPROVED', 'CLOSED', 'ABORTED') THEN
      RAISE EXCEPTION 'Resolved audit sessions are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT "status" INTO session_status FROM "audit_sessions" WHERE "id" = OLD."audit_session_id";
  IF session_status IN ('APPROVED', 'CLOSED', 'ABORTED') THEN
    RAISE EXCEPTION 'Counts belonging to a resolved audit session are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_sessions_terminal_immutable
  BEFORE UPDATE OR DELETE ON "audit_sessions"
  FOR EACH ROW EXECUTE FUNCTION prevent_terminal_audit_mutation();
CREATE TRIGGER audit_count_items_terminal_immutable
  BEFORE UPDATE OR DELETE ON "audit_count_items"
  FOR EACH ROW EXECUTE FUNCTION prevent_terminal_audit_mutation();

CREATE FUNCTION prevent_audit_history_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is retained audit history; TRUNCATE is not permitted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_sessions_no_truncate
  BEFORE TRUNCATE ON "audit_sessions"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_history_truncate();
CREATE TRIGGER audit_count_items_no_truncate
  BEFORE TRUNCATE ON "audit_count_items"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_history_truncate();
