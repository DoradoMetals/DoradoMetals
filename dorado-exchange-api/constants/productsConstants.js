const PRODUCT_FIELDS = `
  id,
  product_name,
  product_description,
  content,
  purity,
  gross,
  bid_premium,
  ask_premium,
  product_type,
  image_front,
  image_back,
  variant_group,
  shadow_offset,
  slug,
  legal_tender,
  domestic_tender,
  is_generic,
  variant_label
`;

const PRODUCT_FIELDS_WITH_ALIAS = `
  p.id,
  p.product_name,
  p.product_description,
  p.content,
  p.purity,
  p.gross,
  p.bid_premium,
  p.ask_premium,
  p.product_type,
  p.image_front,
  p.image_back,
  p.variant_group,
  p.shadow_offset,
  p.slug,
  p.legal_tender,
  p.domestic_tender,
  p.is_generic,
  p.variant_label
`;

module.exports = { PRODUCT_FIELDS, PRODUCT_FIELDS_WITH_ALIAS };
