-- Which refiner the order was sent to.
--
-- `refiner_id` here is exchange's `supplier_id`. The wire still says supplier;
-- features/refiners owns the rename.
--
-- THE ENGAGEMENT OWNS THIS (refiners.orders, 093): which refinery has the
-- metal is a fact about the refiner engagement, not the order row -
-- orders.orders.refinery_id dropped in 094. Written as an upsert so an order
-- whose engagement row has not been created yet still records its refiner:
-- 093 backfilled one per order and the create paths maintain that, but a
-- write that depends on it silently doing nothing would hide the gap.
INSERT INTO refiners.orders (order_id, refiner_id)
VALUES ($2, $1)
ON CONFLICT (order_id) DO UPDATE
  SET refiner_id = EXCLUDED.refiner_id
RETURNING order_id AS id, refiner_id AS supplier_id
