-- The snapshot of a catalogue product. `content` is the product's FINE content
-- and is the truth for this line for the rest of its life; `post_melt` is left
-- NULL because a coin is not melted and a fine weight in a gross-weight column
-- is what MP F1 re-derived the purity out of.
INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, quantity, confirmed, unit)
SELECT gen_random_uuid(), $1, b.id, b.metal_id, b.gross, NULL, b.purity,
       b.content, 1, false, 't oz'
  FROM products.bullion b
 WHERE b.id = $2
RETURNING *
