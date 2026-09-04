SELECT b.id, b.name, b.description, b.bid_premium, b.ask_premium, b.type,
       b.created_at, b.updated_at, b.image_front, b.image_back, b.display,
       b.content, b.gross, b.purity, b.variant_group, b.shadow_offset, b.stock,
       b.created_by, b.updated_by, b.homepage_display, b.filter_category,
       b.quantity, b.slug, b.legal_tender, b.domestic_tender, b.is_generic,
       b.variant_label,
       m.name AS metal, mi.name AS mint, o.name AS supplier
  FROM products.bullion b
  JOIN metals.metals m ON m.id = b.metal_id
  JOIN products.mints mi ON mi.id = b.mint_id
  JOIN refiners.refiners r ON r.id = b.supplier_id
  JOIN organizations.organizations o ON o.id = r.organization_id
 WHERE __PREDICATE__
 ORDER BY b.name ASC, b.id ASC
