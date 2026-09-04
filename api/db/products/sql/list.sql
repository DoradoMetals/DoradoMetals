-- THE PUBLIC CATALOGUE, one statement for every question anyone asks of it.
-- There were six - storefront, sell, homepage, slug, ids, filtered - differing
-- only in their WHERE, and each grew its own file.
-- No display, stock, created_by, timestamps, filter_category or quantity:
-- anyone on the internet reads this (tests/unit.test.ts fails if one appears).
-- The metal and the mint are JOINED. Both are NOT NULL foreign keys, so an
-- inner join keeps the old composer's semantics (a product whose reference row
-- vanished is dropped, not rendered blank) without a second read.
-- The predicate and the ordering are substituted by repo.ts, both from
-- closed sets it owns; every VALUE stays bound.
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
