-- The direction of ONE order.
--
-- orders.orders only. This asked all three order tables - the two exchange
-- halves UNION the new one - while the reads were still pivoting; the read
-- pivot landed (a12b76ed) and orders.orders is the authority, so a UNION
-- against exchange is a legacy read and nothing else. The ::text cast the
-- union needed (orders.direction is an ENUM, and a UNION of an enum against
-- text refuses with 42804) is kept because callers compare it as a string.
SELECT direction::text AS direction
  FROM orders.orders
 WHERE id = $1
