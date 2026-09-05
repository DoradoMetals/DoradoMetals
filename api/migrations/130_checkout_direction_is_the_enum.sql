ALTER TABLE checkout.checkouts ALTER COLUMN direction TYPE orders.direction USING direction::orders.direction;
