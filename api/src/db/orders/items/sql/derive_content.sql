-- A scrap line's fine content is derived from the weights the row now holds,
-- once, here (MP F1). A catalogue line is excluded by the WHERE: its content is
-- the product's own fine content, snapshotted at create, and re-deriving it
-- from post_melt x purity applied the purity a second time.
UPDATE orders.items
   SET content = metals.fine_content(COALESCE(post_melt, pre_melt), unit, purity)
 WHERE id = $1
   AND bullion_id IS NULL
RETURNING id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
          premium, quantity, confirmed, sales_tax_charged, unit, price
