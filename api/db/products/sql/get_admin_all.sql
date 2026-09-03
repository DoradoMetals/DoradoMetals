-- Admin projection: everything the public one has, plus display, stock, timestamps, who touched it, filter_category and quantity.
-- metal_id/mint_id/supplier_id are projected for compose.ts to turn into names.
SELECT
       id, name, description, bid_premium, ask_premium, type,
       created_at, updated_at, image_front, image_back, display,
       content, gross, purity, variant_group, shadow_offset, stock,
       created_by, updated_by, homepage_display, filter_category, quantity,
       slug, legal_tender, domestic_tender, sell_display, is_generic,
       variant_label,
       metal_id, mint_id, supplier_id
  FROM products.bullion
 ORDER BY name ASC, id ASC
