const PRODUCT_FIELDS = `
  product_name,
  product_description,
  content,
  bid_premium,
  ask_premium,
  product_type,
  image_front,
  image_back,
  variant_group,
  shadow_offset
`;

const PRODUCT_FIELDS_WITH_ALIAS = `
  p.product_name,
  p.product_description,
  p.content,
  p.bid_premium,
  p.ask_premium,
  p.product_type,
  p.image_front,
  p.image_back,
  p.variant_group,
  p.shadow_offset
`;

module.exports = { PRODUCT_FIELDS, PRODUCT_FIELDS_WITH_ALIAS };

