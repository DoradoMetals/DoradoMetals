-- The spot price the order was quoted at, per metal, frozen at checkout.
INSERT INTO orders.spots (id, order_id, metal_id, ask, bid)
VALUES ($1, $2, $3, $4, $5)
RETURNING id
