INSERT INTO orders.addresses (id, order_id, address_id, source_address_id)
VALUES ($1, $2, $3, $4)
ON CONFLICT (order_id) DO UPDATE SET
  address_id = EXCLUDED.address_id,
  source_address_id = EXCLUDED.source_address_id
RETURNING id
