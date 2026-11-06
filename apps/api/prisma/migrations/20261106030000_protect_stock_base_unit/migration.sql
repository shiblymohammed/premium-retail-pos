CREATE OR REPLACE FUNCTION reject_base_unit_change_with_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."base_unit" IS DISTINCT FROM OLD."base_unit" AND EXISTS (
    SELECT 1
    FROM "variants" v
    JOIN "inventory_movements" m ON m."variant_id" = v."id"
    WHERE v."product_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'product base_unit cannot change after inventory movements exist'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_base_unit_immutable_after_stock
BEFORE UPDATE OF "base_unit" ON "products"
FOR EACH ROW EXECUTE FUNCTION reject_base_unit_change_with_stock();
