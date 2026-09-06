-- A sale line is placed already priced: the quote's premium, tax rate and unit
-- price freeze onto the link row, and the lot itself is untouched.
INSERT INTO orders.lots
       (order_id, lot_id, premium, sales_tax_charged, price, confirmed)
SELECT $1, cl.lot_id, p.premium, p.sales_tax, p.price, true
  FROM checkout.lots cl
  JOIN unnest($3::uuid[], $4::numeric[], $5::numeric[], $6::numeric[])
       AS p(lot_id, premium, sales_tax, price) ON p.lot_id = cl.lot_id
 WHERE cl.checkout_id = $2
 ORDER BY cl.created_at ASC, cl.id ASC
RETURNING id, order_id, lot_id, premium, price, sales_tax_charged, confirmed,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
