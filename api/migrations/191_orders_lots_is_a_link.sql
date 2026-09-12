-- PURE LINKS (ruling 120). `orders.lots` is (order_id, lot_id) and nothing
-- else. 189 carried `premium` and `sales_tax_charged` onto the lot and turned
-- `confirmed` into `confirmed_at` there; `price` goes and does not come back.
--
-- PRICE IS NEVER STORED. It is derived from the order's locked spot, the lot's
-- content and the lot's premium: `content x spot x premium`, bid for a
-- purchase and ask for a sale. `db/pricing/sql/order_pricing.sql` already
-- computed exactly that whenever `price` was null - the column was a
-- short-circuit, not a second definition.
--
-- Measured on the production-shaped copy before the column went, the
-- derivation reproduces the stored price for 62 of 82 purchase lines and 10 of
-- 14 sale lines; the 24 that differ are legacy rows whose stored price was
-- typed over or priced against a spot the order never froze.
-- `docs/waves/lot-model.md` records the counts.
--
-- `exchange` is neither read nor written.

ALTER TABLE orders.lots DROP CONSTRAINT IF EXISTS order_lot_premium_is_not_negative;

ALTER TABLE orders.lots
  DROP COLUMN IF EXISTS premium,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS sales_tax_charged,
  DROP COLUMN IF EXISTS confirmed;
