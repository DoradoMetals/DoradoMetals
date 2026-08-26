// Field lists for exchange.products.
//
// These alias UP to the new schema's names - name, description and type -
// because the new shape is the internal truth now and both implementations
// have to speak it. features/products/wire.ts converts back down to
// product_name and friends on the way out, behind PRODUCTS_WIRE, and that
// adapter is deleted when the frontend stops reading the old names.
export const PRODUCT_FIELDS = `
  id,
  product_name AS name,
  product_description AS description,
  content,
  purity,
  gross,
  bid_premium,
  ask_premium,
  product_type AS type,
  image_front,
  image_back,
  variant_group,
  shadow_offset,
  slug,
  legal_tender,
  domestic_tender,
  sell_display,
  is_generic,
  variant_label
`;

export const PRODUCT_FIELDS_WITH_ALIAS = `
  p.id,
  p.product_name AS name,
  p.product_description AS description,
  p.content,
  p.purity,
  p.gross,
  p.bid_premium,
  p.ask_premium,
  p.product_type AS type,
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

export const ADMIN_PRODUCT_FIELDS = `
  id,
  product_name AS name,
  product_description AS description,
  bid_premium,
  ask_premium,
  product_type AS type,
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

export const ADMIN_PRODUCT_FIELDS_WITH_ALIAS = `
  p.id,
  p.product_name AS name,
  p.product_description AS description,
  p.bid_premium,
  p.ask_premium,
  p.product_type AS type,
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
