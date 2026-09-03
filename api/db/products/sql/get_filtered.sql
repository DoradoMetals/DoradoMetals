-- The storefront's filtered list.
--
-- FILTERS ON metal_id, NOT ON THE METAL'S NAME. The implementation this
-- replaces wrote `metal.name = $1` against a joined metals.metals, so the
-- filter cost a join on every storefront query and could not use the index on
-- metal_id. The name is resolved to an id once, in the service, and an unknown
-- metal name resolves to no id and returns nothing - which is what the join did.
--
-- The predicate is BUILT because the three filters are optional and combine.
-- Only the placeholder NUMBER is interpolated; every value is still bound.
-- The placeholder below is substituted by repo.ts. It is deliberately not
-- named in this comment: the substitution is a string replace, and the first
-- occurrence of the token in the file is what it would have replaced.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, sell_display, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE __PREDICATE__
 ORDER BY name ASC, id ASC
