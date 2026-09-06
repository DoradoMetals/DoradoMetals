-- The assayed fine content, derived from the values the refiner reported, in
-- the one place that defines the conversion (MA F4, MA F10).
UPDATE refiners.items
   SET content = metals.fine_content(COALESCE(post_melt, pre_melt), unit, purity)
 WHERE order_item_id = $1
RETURNING id
