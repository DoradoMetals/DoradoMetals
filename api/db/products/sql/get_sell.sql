-- Every product may be sold back to the business (Jacob, 2026-09-03, ruling
-- 49) - the sell side has no gate. Only the buy side is gated, by `display`
-- (see sql/get_storefront.sql). Same projection otherwise.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 ORDER BY id ASC
