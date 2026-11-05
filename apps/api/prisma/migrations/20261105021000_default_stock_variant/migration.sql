-- Products without selectable variants still need one stable stock identity.
ALTER TABLE "variants" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "variants_one_default_per_product_key"
  ON "variants"("product_id") WHERE "is_default" = true;
