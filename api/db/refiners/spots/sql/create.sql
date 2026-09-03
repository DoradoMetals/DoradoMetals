-- The spot price a refiner quoted for one metal on one order.
-- No ON CONFLICT, deliberately: this table has no unique constraint on
-- (order_id, metal_id) (unlike orders.spots), so naming one raises 42P10.
-- The rule that builds these rows filters out the metals already covered.
INSERT INTO refiners.spots (id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid
