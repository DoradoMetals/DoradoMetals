-- Public projection — anyone on the internet reads this, so no display, stock, created_by, timestamps, filter_category or quantity; tests/unit.test.ts fails if one appears.
-- metal_id/mint_id ARE projected but never reach the wire: compose.ts uses them to attach metal_type/mint_name, then drops them.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE display = true
 ORDER BY id ASC
