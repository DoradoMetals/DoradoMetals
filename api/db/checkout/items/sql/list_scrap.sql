-- The SCRAP lines: those with no bullion. `scrap_id` and `id` are both the
-- line's own id - exchange pointed a cart item at a row in exchange.scrap and
-- here the values live on the line, so there is no second row to reference.
-- Two aliases of one column is what keeps the wire shape identical.
SELECT ci.id AS cart_item_id,
       ci.id AS scrap_id,
       ci.id,
       ci.quantity,
       ci.pre_melt,
       ci.post_melt,
       ci.purity,
       ci.content,
       ci.unit AS gross_unit,
       ci.premium AS bid_premium,
       metal.name AS metal
  FROM checkout.items ci
  LEFT JOIN metals.metals metal ON metal.id = ci.metal_id
 WHERE ci.checkout_id = $1 AND ci.bullion_id IS NULL
 ORDER BY ci.id
