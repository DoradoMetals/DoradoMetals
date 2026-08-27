-- The quoted spot, which exchange keys by metal NAME rather than by id.
INSERT INTO exchange.order_metals (sales_order_id, type, ask_spot)
VALUES ($1, $2, $3)
