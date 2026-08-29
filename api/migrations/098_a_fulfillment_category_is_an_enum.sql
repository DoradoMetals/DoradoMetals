-- A HAND-WRITTEN UNION OF STRING LITERALS IS ALWAYS ONE OF TWO DEFECTS (D103):
-- a duplicate of a generated enum, or a constraint the database does not have.
-- `fulfillments.methods.category` is the second kind, in three copies.
--
--   api/features/fulfillments/service.ts:66          "SHIPMENT" | "PICKUP" | "DIRECT"
--   api/features/fulfillments/methods/service.ts:22  "SHIPMENT" | "PICKUP" | "DIRECT"
--   api/features/orders/intake.ts:47                 "SHIPMENT" | "PICKUP" | "DIRECT"
--
-- The column is `text NOT NULL DEFAULT 'OTHER'`. So the three types agree with
-- each other and NONE of them agrees with the column: the database's own idea
-- of a category a row may have includes a fourth value that no code path can
-- represent, and it is the value an INSERT gets when nobody says. Nothing has
-- ever hit it - eleven rows in dev, the same eleven in production, SHIPMENT 6 /
-- DIRECT 4 / PICKUP 1 in both, measured before this was written - because the
-- only INSERT is 047's seed and it states every category. But a
-- 'OTHER' row would satisfy the column and then fail three switch statements,
-- and once the wire contract stops saying `z.string()` it would fail at parse.
--
-- assertCategory (features/fulfillments/service.ts) exists BECAUSE of this: it
-- is a runtime check written to enforce, in application code, what a type could
-- have enforced in the schema. That guard stays - it checks that a detail row
-- matches its parent's category, which is a different invariant - but the
-- vocabulary itself belongs to the database now.
--
-- THE DEFAULT GOES, AND THAT IS THE POINT rather than a side effect. A category
-- has no sensible fallback: which of the three a method is decides which detail
-- table its fulfillments live in, so an unstated one is a caller that has not
-- decided. Refusing is right; inventing 'OTHER' is not.
--
-- New schema only. Nothing in exchange has a fulfillment method - fulfillments
-- is the one feature exchange never recorded - so there is no pair to keep
-- level and no *_SOURCE switch to be consistent with.
--
-- SAFE ON PRODUCTION when it eventually runs: the USING cast below raises 22P02
-- on any value that is not a label, so a row this migration cannot represent
-- stops it rather than being silently rewritten. Verified against production
-- read-only first: three distinct values, all three labels.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'fulfillments' AND t.typname = 'category'
  ) THEN
    CREATE TYPE fulfillments.category AS ENUM ('SHIPMENT', 'PICKUP', 'DIRECT');
  END IF;
END $$;

-- Order matters: a text default cannot survive the type change, so it is
-- dropped first rather than re-expressed.
ALTER TABLE fulfillments.methods ALTER COLUMN category DROP DEFAULT;

ALTER TABLE fulfillments.methods
  ALTER COLUMN category TYPE fulfillments.category
  USING category::fulfillments.category;

COMMENT ON COLUMN fulfillments.methods.category IS
  'Which detail table this method''s fulfillments live in: SHIPMENT -> shipping.shipments, PICKUP -> fulfillments.pickups, DIRECT -> fulfillments.directs. No default - an unstated category is a caller that has not decided.';
