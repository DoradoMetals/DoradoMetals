-- The address links of several orders at once.
SELECT id, order_id, address_id, source_address_id
  FROM orders.addresses
 WHERE order_id = ANY($1::uuid[])
