-- The BULLION lines of a SALE session, in the shape that wire has always
-- carried. Every product column comes through a LEFT JOIN, so a line whose
-- product was deleted returns nulls rather than disappearing. Three columns
-- are aliased because products.bullion calls them name/description/type.
SELECT ci.id AS cart_item_id,
       ci.bullion_id AS product_id,
       ci.quantity,
       b.id, b.name AS product_name, b.description AS product_description,
       b.type AS product_type, b.gross, b.purity, b.content, b.slug,
       b.bid_premium, b.ask_premium, b.image_front, b.image_back,
       b.shadow_offset, b.variant_group, b.variant_label,
       b.is_generic, b.legal_tender, b.domestic_tender, b.sell_display,
       metal.name AS metal_type,
       mint.name AS mint_name
  FROM checkout.items ci
  LEFT JOIN products.bullion b ON b.id = ci.bullion_id
  LEFT JOIN metals.metals metal ON metal.id = b.metal_id
  LEFT JOIN products.mints mint ON mint.id = b.mint_id
 WHERE ci.checkout_id = $1 AND ci.bullion_id IS NOT NULL
 ORDER BY ci.id
