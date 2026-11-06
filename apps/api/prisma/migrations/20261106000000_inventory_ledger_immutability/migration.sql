-- Reject zero-value movements so every ledger row represents a real stock change.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_nonzero_quantity_check"
  CHECK ("quantity_base_units" <> 0);

-- Keep the actor available for audit and prohibit deletion of the account that
-- authored a movement.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "inventory_movements_variant_id_location_id_idx";
CREATE INDEX "inventory_movements_variant_id_location_id_stock_state_idx"
  ON "inventory_movements"("variant_id", "location_id", "stock_state");
CREATE INDEX "inventory_movements_actor_id_created_at_idx"
  ON "inventory_movements"("actor_id", "created_at");

CREATE OR REPLACE FUNCTION reject_inventory_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements is append-only; % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER inventory_movements_no_update_or_delete
BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION reject_inventory_movement_mutation();

CREATE TRIGGER inventory_movements_no_truncate
BEFORE TRUNCATE ON "inventory_movements"
FOR EACH STATEMENT EXECUTE FUNCTION reject_inventory_movement_mutation();
