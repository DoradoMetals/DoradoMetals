-- The homepage selection — both flags checked: a product pulled from the storefront leaves the homepage with it.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE display = true AND homepage_display = true
 ORDER BY id ASC
