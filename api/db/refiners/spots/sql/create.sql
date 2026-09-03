-- The spot price a refiner quoted for one metal on one order.
-- No ON CONFLICT, deliberately: this table has no unique constraint on (order_id, metal_id) (unlike orders.spots), so naming one raises 42P10; nothing stops duplicate rows for the same order+metal today.
-- refiner_order_id is resolved here (one engagement per order) rather than passed, so a caller can't hand in a mismatched pair.
INSERT INTO refiners.spots (id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid)
VALUES ($1, $2, (SELECT ro.id FROM refiners.orders ro WHERE ro.order_id = $2), $3, $4, $5, $6)
RETURNING id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid
