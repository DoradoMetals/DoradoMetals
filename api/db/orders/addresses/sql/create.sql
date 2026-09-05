INSERT INTO orders.addresses (order_id, address_id, source_address_id)
VALUES ($1, $2, $3)
ON CONFLICT (order_id) DO UPDATE SET
  address_id = EXCLUDED.address_id,
  source_address_id = EXCLUDED.source_address_id
RETURNING id
