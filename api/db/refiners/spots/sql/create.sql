INSERT INTO refiners.spots (id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, order_id, refiner_order_id, metal_id, refiner_id, ask, bid
