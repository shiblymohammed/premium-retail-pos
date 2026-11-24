ALTER TABLE "audit_thresholds" ADD COLUMN "recount_measure" TEXT NOT NULL DEFAULT 'either';
ALTER TABLE "audit_thresholds" ADD CHECK ("recount_measure" IN ('either', 'units', 'percent'));
ALTER TABLE "audit_count_items" ADD COLUMN "recount_measure" TEXT NOT NULL DEFAULT 'either';
ALTER TABLE "audit_count_items" ADD CHECK ("recount_measure" IN ('either', 'units', 'percent'));
