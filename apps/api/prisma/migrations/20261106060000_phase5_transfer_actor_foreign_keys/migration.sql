-- Add the user relations required for transfer lifecycle accountability.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_requested_by_user_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_approved_by_user_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_dispatched_by_user_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_dispatched_by_user_id_fkey" FOREIGN KEY ("dispatched_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_received_by_user_id_fkey') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
