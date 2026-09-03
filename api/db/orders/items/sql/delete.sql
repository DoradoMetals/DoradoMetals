-- Remove one line, WITHIN ONE ORDER.
--
-- THE ORDER ID IS NOT OPTIONAL. A line carries the scrap weights, the purity
-- and the assay figures recording what was recovered from a customer's parcel,
-- and that record exists nowhere else. A stale id list from a frontend that has
-- moved on would otherwise delete from an order nobody named, with no undo.
DELETE FROM orders.items
 WHERE order_id = $1
   AND id = $2
RETURNING id
