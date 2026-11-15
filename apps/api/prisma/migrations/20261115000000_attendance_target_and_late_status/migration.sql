ALTER TABLE "locations"
ADD COLUMN "attendance_start_time" VARCHAR(5);

ALTER TABLE "attendances"
ADD COLUMN "is_late" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "target_start_time" VARCHAR(5);
