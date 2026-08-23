-- checkout.items needs the two scrap columns it was missing.
--
-- A sell cart line is scrap: all 27 in production are, and none is a product.
-- exchange keeps the values in exchange.scrap and points the line at it; the new
-- schema puts them on the item, the way orders.items and refiners.items do -
-- Jacob: "we're unifying scrap and bullion for order/refiner/checkout items.
-- they do NOT need to be separate tables."
--
-- January's checkout.items has pre_melt, post_melt, purity, premium and
-- quantity but not content or unit, and both are populated on every scrap row a
-- sell cart references in production. Without them a cart of 8 lb of sterling
-- becomes a cart of 8 of something.
--
-- Unconstrained numeric, like the columns 058 widened on this table for the
-- same reason: exchange.products declares its equivalents unconstrained, and a
-- narrower column here would silently round.
--
-- Additive. exchange is untouched.

ALTER TABLE checkout.items
  ADD COLUMN IF NOT EXISTS content numeric,
  ADD COLUMN IF NOT EXISTS unit text;
