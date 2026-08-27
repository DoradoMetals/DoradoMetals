-- One of the three booleans an order carries: order_sent, tracking_updated,
-- review_created.
--
-- ONE STATEMENT FOR THREE FLAGS, and the column name is interpolated - which is
-- safe here and nowhere near a request: repo.ts maps a closed set of three
-- literals onto it and nothing else can reach the substitution. Three
-- near-identical files would drift.
--
-- purchase-orders reached this through createReview, which set review_created
-- and nothing else.
UPDATE orders.orders
   SET __COLUMN__ = true, updated_at = now()
 WHERE id = $1
RETURNING id
