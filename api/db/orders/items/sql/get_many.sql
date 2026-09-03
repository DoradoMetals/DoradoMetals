-- The lines of several orders at once, for composing a list.
SELECT id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
       premium, quantity, confirmed, sales_tax_charged, unit, price
  FROM orders.items
 WHERE order_id = ANY($1::uuid[])
 ORDER BY order_id ASC, id ASC
