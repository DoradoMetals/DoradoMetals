-- THE LINES THE BUSINESS SELLS. The same copy as create_bought.sql, joined to
-- the three figures the SALE PRICING decided for each line - the premium it
-- was asked at, the tax rate it was charged and the price it came to. Those
-- are the only values a rule computes; everything else is the basket's, so the
-- statement copies it (ruling 66).
--
-- The decided figures arrive as parallel arrays keyed by the CHECKOUT line's
-- id, so a line the pricing did not answer for simply does not join - which is
-- a short insert the caller counts, not a line quietly priced at zero.
INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, quantity, confirmed, unit, premium, sales_tax_charged, price)
SELECT gen_random_uuid(), $1, i.bullion_id, coalesce(i.metal_id, b.metal_id),
       i.pre_melt, i.post_melt, i.purity, i.content,
       coalesce(i.quantity, 1), true, coalesce(i.unit, 't oz'),
       p.premium, p.sales_tax, p.price
  FROM checkout.items i
  LEFT JOIN products.bullion b ON b.id = i.bullion_id
  JOIN unnest($3::uuid[], $4::numeric[], $5::numeric[], $6::numeric[])
       AS p(line_id, premium, sales_tax, price) ON p.line_id = i.id
 WHERE i.checkout_id = $2
 ORDER BY i.created_at, i.id
RETURNING *
