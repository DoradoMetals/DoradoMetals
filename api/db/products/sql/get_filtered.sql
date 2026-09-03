-- The storefront's filtered list. Filters on metal_id, not the metal's name — the name is resolved to an id once, in the service, so this can use the index on metal_id instead of joining.
-- The predicate below is substituted by repo.ts (only the placeholder number is interpolated; every value stays bound). Deliberately not naming the token here — see repo.ts.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, sell_display, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE __PREDICATE__
 ORDER BY name ASC, id ASC
