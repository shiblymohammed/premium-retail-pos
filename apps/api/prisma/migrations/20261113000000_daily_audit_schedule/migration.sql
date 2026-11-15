ALTER TABLE "locations"
  ADD COLUMN "daily_audit_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "daily_audit_time" VARCHAR(5),
  ADD COLUMN "daily_audit_last_run_date" VARCHAR(10);

ALTER TABLE "audit_sessions"
  ADD COLUMN "is_scheduled" BOOLEAN NOT NULL DEFAULT false;
