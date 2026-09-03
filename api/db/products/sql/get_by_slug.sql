-- One product page, by slug.
--
-- `display` is checked here too. Without it an unpublished product would still
-- be reachable by anyone who knew or guessed its slug, which is the whole point
-- of the flag.
--
-- RETURNS A LIST, AND THE LIST IS THE POINT. A slug does not identify one
-- product: variants of a product share one - `gold-american-eagle` is four rows
-- differing only by variant_label - and the product page renders the set.
-- Neither schema has a unique index on slug, deliberately.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, sell_display, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE display = true AND slug = $1
