-- What a customer may SELL to the business, which is a different set from what
-- they may buy: `sell_display`, not `display`. Same projection as the
-- storefront - see sql/get_storefront.sql.
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, sell_display, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE sell_display = true
 ORDER BY id ASC
