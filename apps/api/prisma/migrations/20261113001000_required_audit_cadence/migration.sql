-- The confirmed cadence is mandatory: stores every day after 19:00 local time;
-- warehouses on Sundays. Use 19:00 as the initial after-hours default for both.
ALTER TABLE "locations"
  ALTER COLUMN "daily_audit_enabled" SET DEFAULT true,
  ALTER COLUMN "daily_audit_time" SET DEFAULT '19:00';

UPDATE "locations"
SET "daily_audit_enabled" = true,
    "daily_audit_time" = COALESCE("daily_audit_time", '19:00');

ALTER TABLE "locations"
  ALTER COLUMN "daily_audit_time" SET NOT NULL;
