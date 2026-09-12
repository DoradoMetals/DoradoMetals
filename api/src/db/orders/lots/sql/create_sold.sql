-- A sale line is placed already priced: the quote's premium and tax rate
-- freeze onto the LOT (ruling 120 - `orders.lots` is a pure link, so there is
-- nowhere else to put them), and the lot is marked confirmed at the moment of
-- sale since a sale line is never re-declared the way a purchase is. Price
-- itself is never stored; it is derived off this premium and the order's
-- frozen spot whenever the lot is read.
WITH priced AS (
  UPDATE inventory.lots li
     SET premium = p.premium,
         sales_tax_rate = p.sales_tax,
         confirmed_at = now()
    FROM unnest($3::uuid[], $4::numeric[], $5::numeric[]) AS p(lot_id, premium, sales_tax)
   WHERE li.id = p.lot_id
  RETURNING li.id
)
INSERT INTO orders.lots (order_id, lot_id)
SELECT $1, cl.lot_id
  FROM checkout.lots cl
  JOIN priced ON priced.id = cl.lot_id
 WHERE cl.checkout_id = $2
 ORDER BY cl.created_at ASC, cl.id ASC
RETURNING id, order_id, lot_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
