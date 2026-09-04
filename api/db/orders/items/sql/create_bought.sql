-- THE LINES THE BUSINESS BUYS, copied from the basket they were declared in
-- (ruling 66). The metal is resolved through the product where the line does
-- not carry one - orders.items.metal_id is NOT NULL, a product knows its own
-- metal, and a scrap line already has one; a line that resolves to neither
-- raises 23502 naming the column rather than being silently dropped.
--
-- NO PREMIUM: the cart's is a display figure, and every purchase line is
-- tiered from rates.rates at placement (domain/orders/service.ts
-- retierPremiums). Nothing is confirmed until an admin says so.
INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, quantity, confirmed, unit)
SELECT gen_random_uuid(), $1, i.bullion_id, coalesce(i.metal_id, b.metal_id),
       i.pre_melt, i.post_melt, i.purity, i.content,
       coalesce(i.quantity, 1), false, i.unit
  FROM checkout.items i
  LEFT JOIN products.bullion b ON b.id = i.bullion_id
 WHERE i.checkout_id = $2
 ORDER BY i.created_at, i.id
RETURNING *
