SELECT DISTINCT oa.source_address_id
  FROM orders.orders o
  JOIN orders.addresses oa ON oa.order_id = o.id
 WHERE oa.source_address_id = ANY($1::uuid[])
   AND o.user_id = $2
   AND o.status IS DISTINCT FROM 'Completed'
