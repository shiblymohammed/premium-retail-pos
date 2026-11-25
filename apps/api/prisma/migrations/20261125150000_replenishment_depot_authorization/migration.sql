ALTER TABLE public."replenishment_requests"
  ADD COLUMN "depot_authorized_at" TIMESTAMP(3),
  ADD COLUMN "depot_authorized_by_user_id" TEXT,
  ADD CONSTRAINT "replenishment_requests_depot_authorized_by_user_id_fkey"
    FOREIGN KEY ("depot_authorized_by_user_id") REFERENCES public."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "replenishment_requests_depot_authorization_pair"
    CHECK (("depot_authorized_at" IS NULL) = ("depot_authorized_by_user_id" IS NULL));
