-- The products a cart names, read back from the server.
--
-- THIS IS WHY THE CART CANNOT SET A PRICE. The client sends ids and quantities;
-- premium, content and purity come from here. No `display` filter, deliberately:
-- checkout asks about liveness separately through get_liveness.sql, which
-- answers per id and per direction, and folding the two together would turn "you
-- may not buy that" into "that does not exist".
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, sell_display, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE id = ANY($1::uuid[])
