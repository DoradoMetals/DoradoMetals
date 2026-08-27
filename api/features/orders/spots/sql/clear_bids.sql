-- Drop every bid on an order, so they can be re-quoted.
--
-- ONLY the bid. exchange's clearOrderMetals set bid_spot alone and left the ask
-- untouched, and that asymmetry is real: we bid to buy from the customer, and
-- the ask is what the same metal sells for. Clearing both would lose a number
-- this statement never owned.
UPDATE orders.spots
   SET bid = NULL, updated_at = now()
 WHERE order_id = $1
RETURNING id
