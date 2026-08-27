-- Remove lines by id, WITHIN ONE ORDER.
--
-- THE ORDER ID IS NOT OPTIONAL, and that is a fix rather than a copy.
--
-- exchange's deleteOrderItems was `WHERE id = ANY($1)` with no order scoping at
-- all, while both of its siblings had it - updateOrderItemPrices scopes on
-- `id = $2 AND purchase_order_id = $3`, toggleOrderItemStatus on
-- `purchase_order_id = $2 AND id = ANY($3)`. The service even computed the
-- order id one line above the call, for something else, and never passed it.
--
-- It matters because of what a line carries: the scrap weights, purity and the
-- assay figures recording what was actually recovered from a customer's parcel.
-- The service's own comment says that "exists nowhere else". A payload mixing
-- ids from two orders, or a stale list from a frontend that has moved on,
-- silently deletes from an order nobody named, and there is no undo.
--
-- THE SCRAP GOES WITH THE LINE, because the scrap IS the line here. In exchange
-- these were two deletes - the item and the exchange.scrap row it pointed at -
-- and one of them could succeed alone.
DELETE FROM orders.items
 WHERE order_id = $1
   AND id = ANY($2::uuid[])
RETURNING id
