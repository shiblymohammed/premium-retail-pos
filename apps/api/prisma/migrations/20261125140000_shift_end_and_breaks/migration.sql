ALTER TABLE "locations" ADD COLUMN "attendance_end_time" VARCHAR(5);
ALTER TABLE "attendances" ADD COLUMN "scheduled_end_at" TIMESTAMP(3);
CREATE TABLE "attendance_breaks" (
  "id" TEXT PRIMARY KEY,
  "clock_in_id" TEXT NOT NULL REFERENCES "attendances"("id") ON DELETE RESTRICT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3),
  CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
CREATE INDEX "attendance_breaks_clock_in_id_idx" ON "attendance_breaks" ("clock_in_id");
CREATE UNIQUE INDEX "attendance_breaks_one_open" ON "attendance_breaks" ("clock_in_id") WHERE "ended_at" IS NULL;
