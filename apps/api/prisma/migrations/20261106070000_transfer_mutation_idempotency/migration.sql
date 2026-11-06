-- Persist request hashes for actor-bound replay protection on transfer mutations.
ALTER TABLE "idempotency_records"
  ADD COLUMN "payload_hash" TEXT NOT NULL DEFAULT '';
