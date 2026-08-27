-- The weights of a scrap line, which is what an admin edits after
-- the metal arrives and is weighed.
--
-- content is COMPUTED BY THE CALLER, not here: it is
-- convertTroyOz(post_melt ?? pre_melt, unit) * purity, and the unit conversion
-- is a JavaScript table rather than anything Postgres knows. Doing it here
-- would mean two definitions of what content means.
UPDATE orders.items
   SET pre_melt = $1, post_melt = $2, purity = $3, content = $4
 WHERE id = $5
RETURNING id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
          premium, quantity, confirmed, sales_tax_charged, unit, price
