-- The products a cart names, read back from the server — the client sends ids and quantities; premium, content and purity come from here, so the cart cannot set a price.
-- No `display` filter, deliberately: liveness is checked separately (get_liveness.sql) so "you may not buy that" stays distinct from "that does not exist".
SELECT
       id, name, description, content, purity, gross,
       bid_premium, ask_premium, type,
       image_front, image_back, variant_group, shadow_offset, slug,
       legal_tender, domestic_tender, is_generic, variant_label,
       metal_id, mint_id
  FROM products.bullion
 WHERE id = ANY($1::uuid[])
