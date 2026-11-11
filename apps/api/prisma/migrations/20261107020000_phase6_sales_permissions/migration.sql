ALTER TABLE "users"
ADD COLUMN "can_cancel_sales" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "can_process_returns" BOOLEAN NOT NULL DEFAULT false;
