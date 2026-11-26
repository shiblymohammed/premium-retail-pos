-- New receipt submissions share an immutable ID across their inventory movements.
-- Existing append-only ledger rows keep their original metadata.
ALTER TABLE "inventory_movements"
ADD COLUMN "receipt_id" UUID;
