-- THE PRICE OF THE ORDER. On a purchase order this is what the customer is
-- paid.
--
-- DELIBERATELY NOT ANOTHER ENTRY IN set_amount.sql's CLOSED SET, and the
-- reason is a safety property rather than a style preference. Those five are
-- ADJUSTABLE AMOUNTS - fees an admin edits on a drawer, each one a line that
-- moves the total a little. `total` is the total. Folding it into the same
-- call would make `setAmount(id, "total", x)` read like a fee edit at every
-- call site, and the one thing a reader must not mistake for a fee is the
-- number the money moves on.
--
-- NULLABLE, and that is a real state rather than an accident: exchange's
-- resetOrderTotal wrote `total_price = NULL` to mean "this order is not
-- priced any more", which is what clearing an order's pricing does before it
-- is re-derived. So $1 is passed through as-is and never coalesced.
--
-- Replaces the total half of TWO exchange statements - resetOrderTotal
-- (NULL) and recordOrderPricing (a value, alongside spots_locked = TRUE).
-- recordOrderPricing's second column lives in orders.orders, not here, so
-- that one is two writes in the service rather than one statement across two
-- tables. See features/orders/sql/set_spots_locked.sql.
UPDATE orders.transactions
   SET total = $1,
       updated_by = coalesce($2, updated_by),
       updated_at = now()
 WHERE order_id = $3
RETURNING id, order_id, total
