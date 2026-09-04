SELECT b.id, b.name, b.description, b.content, b.purity, b.gross,
       b.bid_premium, b.ask_premium, b.type,
       b.image_front, b.image_back, b.variant_group, b.shadow_offset, b.slug,
       b.legal_tender, b.domestic_tender, b.is_generic, b.variant_label,
       b.metal_id, b.mint_id,
       m.name AS metal_type, mi.name AS mint_name
  FROM products.bullion b
  JOIN metals.metals m ON m.id = b.metal_id
  JOIN products.mints mi ON mi.id = b.mint_id
 WHERE __PREDICATE__
 ORDER BY __ORDERING__
