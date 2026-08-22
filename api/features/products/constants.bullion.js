// Field lists for products.bullion, which names three columns differently from
// exchange.products: name, description and type where exchange has
// product_name, product_description and product_type.
//
// Each list aliases them back, so a caller reading either implementation sees
// the exchange names. The rename is a property of the new schema, not something
// consumers have to learn about mid-migration.
//
// BULLION_PRODUCT_FIELDS is fully qualified with the `product.` alias. The
// exchange query writes `SELECT product.${PRODUCT_FIELDS}`, which qualifies only
// the first field - harmless while the column was product_name and unique across
// the join, but `name` collides with mint.name.
//
// Kept beside the exchange lists rather than derived from them, because a
// column added to one is not automatically wanted in the other - and a
// projection that silently grew is how columns start leaking onto the wire.

export const BULLION_PRODUCT_FIELDS = `
  product.id,
  product.name AS product_name,
  product.description AS product_description,
  product.content,
  product.purity,
  product.gross,
  product.bid_premium,
  product.ask_premium,
  product.type AS product_type,
  product.image_front,
  product.image_back,
  product.variant_group,
  product.shadow_offset,
  product.slug,
  product.legal_tender,
  product.domestic_tender,
  product.sell_display,
  product.is_generic,
  product.variant_label
`;

export const BULLION_PRODUCT_FIELDS_WITH_ALIAS = `
  p.id,
  p.name AS product_name,
  p.description AS product_description,
  p.content,
  p.purity,
  p.gross,
  p.bid_premium,
  p.ask_premium,
  p.type AS product_type,
  p.image_front,
  p.image_back,
  p.variant_group,
  p.shadow_offset,
  p.slug,
  p.legal_tender,
  p.domestic_tender,
  p.sell_display,
  p.is_generic,
  p.variant_label
`;

export const BULLION_ADMIN_PRODUCT_FIELDS = `
  id,
  name AS product_name,
  description AS product_description,
  bid_premium,
  ask_premium,
  type AS product_type,
  created_at,
  updated_at,
  image_front,
  image_back,
  display,
  content,
  gross,
  purity,
  variant_group,
  shadow_offset,
  stock,
  created_by,
  updated_by,
  homepage_display,
  filter_category,
  quantity,
  slug,
  legal_tender,
  domestic_tender,
  sell_display,
  is_generic,
  variant_label
`;

export const BULLION_ADMIN_PRODUCT_FIELDS_WITH_ALIAS = `
  p.id,
  p.name AS product_name,
  p.description AS product_description,
  p.bid_premium,
  p.ask_premium,
  p.type AS product_type,
  p.created_at,
  p.updated_at,
  p.image_front,
  p.image_back,
  p.display,
  p.content,
  p.gross,
  p.purity,
  p.variant_group,
  p.shadow_offset,
  p.stock,
  p.created_by,
  p.updated_by,
  p.homepage_display,
  p.filter_category,
  p.quantity,
  p.slug,
  p.legal_tender,
  p.domestic_tender,
  p.sell_display,
  p.is_generic,
  p.variant_label
`;
