-- The four constrained columns in the database, widened to match the other fourteen.
--
-- *** WHAT WAS ROUNDING. *** exchange.scrap held purity and purity_actual as
-- numeric(4,3) and content and content_actual as numeric(20,3). Three decimals.
-- Postgres rounds half away from zero, so .9999 fine gold and .9995 platinum
-- both became exactly 1.000 on the way in - and production holds 10 products at
-- .9999 and 6 at .9995 against 8 scrap rows sitting at exactly 1.000, which is
-- a purity nothing on earth actually has. D200.
--
-- *** "PUT EVERYTHING AT 4 DECIMALS" WOULD HAVE MADE IT WORSE, AND THAT IS WHY
-- THIS IS UNCONSTRAINED INSTEAD. *** Measured before writing anything: of the
-- eighteen purity/content columns in this database, only these FOUR carry a
-- precision at all. checkout.items, exchange.products, orders.items,
-- products.bullion, refiners.items and both sales_tax_rules are already
-- unconstrained `numeric`. Capping the schema at 4 decimals would have NARROWED
-- fourteen columns that are currently exact, to fix four that are not.
-- orders.items.purity in particular was widened from numeric(4,3) to
-- unconstrained for exactly this reason and re-adding a cap would undo that.
--
-- So: drop the constraint on the four. That is strictly wider than four decimals
-- and it makes all eighteen agree.
--
-- *** content MATTERS MORE THAN purity HERE. *** purity is a ratio and the loss
-- is 0.05%. content is TROY OUNCES, and content_actual is what a customer is
-- PAID on: at ~$4,000/oz gold, the third decimal is about $4 a row. Both are
-- widened; the content pair is not an afterthought.
--
-- *** NOT DESTRUCTIVE, AND NOT A FIX FOR WHAT ALREADY HAPPENED. *** Widening a
-- numeric preserves every stored value exactly - nothing is rewritten, nothing
-- is dropped, and lint:migrations passes it without an allow-destructive marker.
-- It stops FUTURE loss. The 8 production rows already flattened to 1.000 cannot
-- be recovered from this database; their originals are gone.
--
-- Reversible, though re-narrowing would round:
--   ALTER TABLE exchange.scrap ALTER COLUMN purity TYPE numeric(4,3);   -- lossy
ALTER TABLE exchange.scrap ALTER COLUMN purity         TYPE numeric;
ALTER TABLE exchange.scrap ALTER COLUMN purity_actual  TYPE numeric;
ALTER TABLE exchange.scrap ALTER COLUMN content        TYPE numeric;
ALTER TABLE exchange.scrap ALTER COLUMN content_actual TYPE numeric;

COMMENT ON COLUMN exchange.scrap.purity IS
  'Unconstrained on purpose (105). numeric(4,3) rounded .9999 fine gold to 1.000. See FOLLOWUPS D200.';
COMMENT ON COLUMN exchange.scrap.purity_actual IS
  'The assayed purity. Unconstrained on purpose (105) - it multiplies into content_actual, which is what a customer is paid on.';
COMMENT ON COLUMN exchange.scrap.content IS
  'Troy ounces. Unconstrained on purpose (105); the third decimal is ~$4 of gold.';
COMMENT ON COLUMN exchange.scrap.content_actual IS
  'Troy ounces actually assayed - the basis a customer is paid on. Unconstrained on purpose (105).';
