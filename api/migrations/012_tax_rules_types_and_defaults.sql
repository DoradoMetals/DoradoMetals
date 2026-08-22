-- Restore two things tax.sales_tax_rules lost relative to exchange.
--
-- 1. The enums. exchange types metal_category and product_type as enums; the
--    tax schema declared them text. The stored values are identical in both,
--    so the conversion is lossless - but text permits 'gold', 'Gold ' or
--    'Titanium', and a sales tax rule that silently matches nothing is a
--    quiet way to charge the wrong tax. The types are created in the tax
--    schema rather than reusing exchange's, so the schema stays
--    self-contained, matching how orders.direction and shipping.direction are
--    schema-local.
--
-- 2. The unbounded sentinels. exchange defaults max_price, aggregate_max and
--    weight_max to 1e12, meaning "no upper bound". The tax schema defaults
--    them to 1e6. Existing rows carry 1e12 in both tables, so no data is
--    affected - but a rule created without an explicit maximum would stop
--    applying above one million. The largest order to date is ~$13.8k, so
--    nothing has hit it; it is wrong rather than currently broken, and the
--    kind of wrong that surfaces on an unusually large order.
--
-- markup_max_pct is left alone: 1e6 as a percentage cap is already absurd
-- enough to mean unbounded, and both schemas agree on it.

CREATE TYPE tax.sales_tax_metal_category AS ENUM ('Gold', 'Silver', 'Platinum', 'Palladium', 'All');
CREATE TYPE tax.sales_tax_product_type   AS ENUM ('Coin', 'Bar', 'Collectible', 'All');

ALTER TABLE tax.sales_tax_rules
  ALTER COLUMN metal_category DROP DEFAULT,
  ALTER COLUMN product_type   DROP DEFAULT;

ALTER TABLE tax.sales_tax_rules
  ALTER COLUMN metal_category TYPE tax.sales_tax_metal_category
    USING metal_category::tax.sales_tax_metal_category,
  ALTER COLUMN product_type TYPE tax.sales_tax_product_type
    USING product_type::tax.sales_tax_product_type;

ALTER TABLE tax.sales_tax_rules
  ALTER COLUMN metal_category SET DEFAULT 'All',
  ALTER COLUMN product_type   SET DEFAULT 'All',
  ALTER COLUMN max_price      SET DEFAULT 1000000000000,
  ALTER COLUMN aggregate_max  SET DEFAULT 1000000000000,
  ALTER COLUMN weight_max     SET DEFAULT 1000000000000;
