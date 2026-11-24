ALTER TABLE "products" ADD COLUMN "sell_by_carton" BOOLEAN NOT NULL DEFAULT false;
UPDATE "products" SET "sell_by_carton" = true WHERE "units_per_carton" > 1;
ALTER TABLE "products" ADD CONSTRAINT "products_carton_sale_requires_size"
  CHECK (NOT "sell_by_carton" OR COALESCE("units_per_carton", 0) > 1);

ALTER TABLE "transfer_lines" ADD COLUMN "carton_required" BOOLEAN NOT NULL DEFAULT false;
-- Keep the shipping mode under which existing transfers were approved.
UPDATE "transfer_lines" AS line SET "carton_required" = true
FROM "transfers" AS transfer
JOIN "locations" AS source ON source.id = transfer.source_location_id
JOIN "locations" AS destination ON destination.id = transfer.dest_location_id
WHERE line.transfer_id = transfer.id AND line.units_per_carton > 1
  AND ((source.type = 'MAIN_WAREHOUSE' AND destination.type = 'SUB_WAREHOUSE')
    OR (source.type = 'SUB_WAREHOUSE' AND destination.type = 'RETAIL_STORE'));
