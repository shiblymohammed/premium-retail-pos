CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "in_app_notifications_user_id_dedupe_key_key"
ON "in_app_notifications"("user_id", "dedupe_key");

CREATE INDEX "in_app_notifications_user_id_read_at_created_at_idx"
ON "in_app_notifications"("user_id", "read_at", "created_at");

ALTER TABLE "in_app_notifications"
ADD CONSTRAINT "in_app_notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
