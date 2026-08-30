-- The two weight columns 105 missed, found by a test that named them.
--
-- 105 widened purity, purity_actual, content and content_actual on
-- exchange.scrap and stopped there, because those were the four this
-- investigation started from. It was incomplete: `pre_melt` and `post_melt` are
-- also numeric(20,3), and they are TROY OUNCE WEIGHTS - the mass of the parcel
-- a customer actually mailed in.
--
-- *** THEY MATTER FOR THE SAME REASON content DOES, BECAUSE content IS MADE OF
-- THEM. *** content = post_melt x purity. Rounding the weight to three decimals
-- rounds the thing the customer is paid on, one step earlier and just as
-- invisibly. At ~$4,000/oz gold the third decimal is about $4 per line.
--
-- *** FOUND BY A TEST, NOT BY THE AUDIT. *** parity.test.ts asserted
-- `["content:3", "post_melt:3", "pre_melt:3", "purity:3"]` with the message
-- "exchange.scrap has been widened - update FOLLOWUPS and delete this test".
-- Widening four of those four names left two behind, and the assertion listing
-- all four is what said so. audit:precision could not: it casts a source value
-- into the TARGET's type, and a loss that already happened at the source is
-- invisible to it by construction (CLAUDE.md says so in its own entry).
--
-- *** post_melt_actual WAS ALREADY UNCONSTRAINED *** - an asymmetry nobody
-- recorded, where the estimate rounded and the assay did not. After this the
-- whole table agrees.
--
-- Widening. Every stored value survives exactly; nothing is rewritten or
-- dropped. lint:migrations passes it without a marker because bare `numeric`
-- cannot lose a numeric value - see the rule and its two self-test cases.
ALTER TABLE exchange.scrap ALTER COLUMN pre_melt  TYPE numeric;
ALTER TABLE exchange.scrap ALTER COLUMN post_melt TYPE numeric;

COMMENT ON COLUMN exchange.scrap.pre_melt IS
  'Troy ounces as received. Unconstrained on purpose (106) - the third decimal is ~$4 of gold, and content is derived from post_melt.';
COMMENT ON COLUMN exchange.scrap.post_melt IS
  'Troy ounces after melt. Unconstrained on purpose (106); content = post_melt x purity, so rounding here rounds what a customer is paid.';
