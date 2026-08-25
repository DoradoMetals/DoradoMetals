-- 060 adds a constraint genesis has already created.
--
-- FOUND BY REHEARSING AGAINST A RESTORED COPY OF PRODUCTION. 060 failed with:
--
--   constraint "ledger_amount_check" for relation "ledger" already exists
--
-- and unlike 039/058, this one is not about production at all. It would fail
-- the same way on any database built from genesis.
--
-- WHY. 000_genesis_schema.sql is generated from dev's CURRENT schema, which is
-- the shape dev reached after every migration - 060 included. Line ~1683 of
-- genesis creates ledger_amount_check, guarded by an existence check so genesis
-- is idempotent. But genesis declares `-- baseline: 002-049`, so only those are
-- recorded as done. 050 onwards then run on top of a schema that already has
-- their effects.
--
-- Most of them survive that because they are written idempotently -
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS - or because they are
-- data backfills, which are supposed to run. 060 line 51 is
-- `ADD CONSTRAINT ... CHECK`, and Postgres has no ADD CONSTRAINT IF NOT EXISTS.
--
-- WHY THIS IS CONDITIONAL, AND MY FIRST ATTEMPT WAS WRONG. The obvious file is
-- "drop it, then add it back", and that fails for the same reason 060 does: the
-- constraint is present again by the time 060 runs. The obvious second attempt
-- is "just drop it" - and that is wrong on dev, where 060 was applied months ago
-- and will be SKIPPED, so nothing re-adds it and dev quietly loses the check.
--
-- One file has to be correct on both, and what distinguishes them is exactly
-- whether 060 is still pending. So it asks:
--
--   060 already applied  ->  leave the constraint alone. Dev.
--   060 still pending    ->  drop it, so 060 can add it. A fresh build, or the
--                            rehearsal copy of production.
--
-- Reading schema_migrations from inside a migration is unusual and is the point
-- here: the condition IS "has the migration that owns this constraint run yet",
-- and any proxy for that would be a guess.
--
-- The definitions are identical either way - genesis writes
-- `CHECK ((amount >= (0)::numeric))` and 060 writes `CHECK (amount >= 0)`,
-- which Postgres normalises to the same thing - so nothing about the schema
-- changes. payments.ledger is in the new schema and PAYMENTS_SOURCE has never
-- been promoted, so nothing writes to it in the window between the two.
--
-- THE BROADER POINT, which this file does not fix. The baseline claims genesis
-- reflects migrations 002-049. It actually reflects all of them. Closing that
-- gap properly means either extending the baseline to cover every schema-only
-- migration - leaving the data backfills to run - or regenerating genesis at a
-- known migration number and keeping the two in step. Both are decisions about
-- the migration chain rather than a fix to one file, and worth making before
-- the next genesis regeneration rather than after.
--
-- exchange is untouched.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM exchange.schema_migrations
     WHERE name = '060_payments_ledger.sql'
  ) THEN
    ALTER TABLE payments.ledger DROP CONSTRAINT IF EXISTS ledger_amount_check;
    RAISE NOTICE '060 is pending; cleared ledger_amount_check so it can add it';
  ELSE
    RAISE NOTICE '060 already applied; leaving ledger_amount_check alone';
  END IF;
END $$;
