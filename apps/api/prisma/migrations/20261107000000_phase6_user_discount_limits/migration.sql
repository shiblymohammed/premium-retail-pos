ALTER TABLE "users"
ADD COLUMN "discount_limit_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "users"
ADD CONSTRAINT "users_discount_limit_percent_range_check"
CHECK ("discount_limit_percent" >= 0 AND "discount_limit_percent" <= 100);
