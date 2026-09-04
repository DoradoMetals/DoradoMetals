SELECT
       sp.id,
       sp.order_id,
       m.name,
       sp.ask,
       sp.bid,
       NULL::numeric AS percent_change,
       NULL::numeric AS dollar_change,
       sp.created_at,
       sp.updated_at
  FROM orders.spots sp
  JOIN metals.metals m ON m.id = sp.metal_id
 WHERE sp.order_id = ANY($1::uuid[])
 ORDER BY sp.order_id ASC, m.name ASC, sp.id ASC
