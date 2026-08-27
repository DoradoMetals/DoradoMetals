-- Where the order has got to.
--
-- THE CANONICAL ONE, for both directions. exchange kept purchase orders and
-- sales orders in two tables and so had two of this statement; orders.orders is
-- one table and needs one. sales-orders currently carries an identical copy in
-- its own sql/ - see D42, they converge here.
--
-- updated_by is ASSIGNED, not coalesced: both exchange statements overwrote it
-- unconditionally, and a status change always has an author.
UPDATE orders.orders
   SET status = $1, updated_by = $2, updated_at = now()
 WHERE id = $3
RETURNING id
