-- One product page, by slug. `display` is checked so an unpublished product isn't reachable by a guessed slug.
-- Returns a LIST, not one row — variants share a slug (gold-american-eagle is four rows by variant_label); neither schema has a unique index on slug, deliberately.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE display = true AND slug = $1
