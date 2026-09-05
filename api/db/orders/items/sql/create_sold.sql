INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, quantity, confirmed, unit, premium, sales_tax_charged, price)
SELECT gen_random_uuid(), $1, i.bullion_id, i.metal_id,
       i.pre_melt, i.post_melt, i.purity, i.content,
       coalesce(i.quantity, 1), true, coalesce(i.unit, 't oz'),
       p.premium, p.sales_tax, p.price
  FROM checkout.items i
  JOIN unnest($3::uuid[], $4::numeric[], $5::numeric[], $6::numeric[])
       AS p(line_id, premium, sales_tax, price) ON p.line_id = i.id
 WHERE i.checkout_id = $2
 ORDER BY i.created_at, i.id
RETURNING *
