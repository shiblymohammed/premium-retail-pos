ALTER TABLE "users" ADD COLUMN "permission_overrides" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "users" ADD CHECK (jsonb_typeof("permission_overrides") = 'object');
