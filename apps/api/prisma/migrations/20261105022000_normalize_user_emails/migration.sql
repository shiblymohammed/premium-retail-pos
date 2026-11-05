DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize user emails: case-insensitive duplicates must be resolved first';
  END IF;
END $$;

UPDATE "users"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = lower(btrim("email")));
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users" (lower("email"));
