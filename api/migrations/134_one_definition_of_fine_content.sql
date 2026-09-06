-- The fine content of a lot has ONE definition, and it lives here.
--
-- Three findings of the 2026-09-07 review meet in this file.
--
-- MP F1: `orders/service.ts` re-derived `content` as post_melt x purity on
-- EVERY patch of a line, and `create_from_product.sql` had written the
-- product's FINE content into `post_melt`. So the required confirm step of the
-- admin lifecycle multiplied a catalogue line's purity in a second time and
-- 8-10% of the customer's metal disappeared from the payout. A catalogue line's
-- content is a SNAPSHOT of the product and nothing may re-derive it; a scrap
-- line's content is derived from its weights, once, here.
--
-- MA F10: the gram and pound constants were wrong in both the JavaScript and
-- `metals.convert_to_troy_oz`. A troy ounce is 31.1034768 g and an avoirdupois
-- pound is 453.59237 g, so a pound is exactly 175/12 troy ounces. The old
-- 31.1035 / 453.592 pair returned LESS fine metal than the weight really is,
-- so the customer was underpaid.
--
-- MA F4: `fineContent` in JavaScript threw on a NULL unit and valued an
-- unrecognised one at ZERO - a persisted `content = 0` on a parcel of real
-- metal. A unit this function does not know is a defect in the row, so it
-- raises; the domain's rules refuse the same input first and answer 422.
--
-- MA F13: `metals.convert_to_troy_oz` had no caller but the test that pinned
-- its divergence from the JavaScript. It goes; `metals.fine_content` is the
-- one definition, and it is the one every write path now calls.
--
-- Reversible: drop metals.fine_content and recreate metals.convert_to_troy_oz
-- with the body 000_genesis_schema.sql carried before this file.

DROP FUNCTION IF EXISTS metals.convert_to_troy_oz(numeric, text);

CREATE FUNCTION metals.fine_content(weight numeric, unit text, purity numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  troy_oz numeric;
BEGIN
  IF weight IS NULL OR purity IS NULL THEN
    RETURN NULL;
  END IF;

  troy_oz := CASE lower(coalesce(unit, ''))
    WHEN 't oz' THEN weight
    WHEN 'g'    THEN weight / 31.1034768
    WHEN 'dwt'  THEN weight / 20
    WHEN 'lb'   THEN weight * (175.0 / 12.0)
  END;

  IF troy_oz IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = format('%L is not a weight this business quotes in', unit);
  END IF;

  RETURN purity * troy_oz;
END;
$$;

-- MP F7 / MI F3, the schema half. `adjust_credit.sql` subtracts without a
-- floor, so a balance that two writers spend at once goes negative and nothing
-- notices. The domain now reads the balance FOR UPDATE inside the placement
-- transaction and refuses; this is what turns the race that survives that into
-- a rollback rather than a negative balance.
--
-- Guarded the way genesis guards a constraint: dev already carried this one when
-- 134 first ran there, so adding it unconditionally made the migration
-- un-runnable rather than idempotent.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'users_dorado_funds_non_negative'
      AND c.relname = 'users' AND n.nspname = 'auth'
  ) THEN
    ALTER TABLE auth.users
      ADD CONSTRAINT users_dorado_funds_non_negative CHECK (dorado_funds >= 0);
  END IF;
END $$;
