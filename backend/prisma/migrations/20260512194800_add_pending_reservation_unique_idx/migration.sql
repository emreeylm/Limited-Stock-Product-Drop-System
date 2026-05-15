-- Partial unique index: a user may not hold more than one PENDING reservation
-- for the same product at the same time.
--
-- "Partial" means the constraint is only enforced for rows where
-- status = 'PENDING', so a user can still checkout and then re-reserve later,
-- and they can have multiple COMPLETED / EXPIRED rows for the same product.
CREATE UNIQUE INDEX "reservation_user_product_pending_unique"
  ON "Reservation" ("userId", "productId")
  WHERE status = 'PENDING';
