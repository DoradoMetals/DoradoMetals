-- Which refiner the order was sent to.
--
-- `refinery_id` here is exchange's `supplier_id`. The wire still says supplier;
-- features/refiners owns the rename and the HTTP route is still /api/suppliers
-- because the frontend calls it.
UPDATE orders.orders
   SET refinery_id = $1, updated_at = now()
 WHERE id = $2
RETURNING id, refinery_id AS supplier_id
