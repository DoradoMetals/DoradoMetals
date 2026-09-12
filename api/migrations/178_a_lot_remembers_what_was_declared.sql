-- The Intake design draws a VARIANCE per lot: what we measured against what the
-- customer declared. Today a lot has one set of weights - `inventory.lots.pre_melt`,
-- `post_melt`, `purity`, `unit`, `quantity` - and the admin's in-house assay
-- OVERWRITES the declaration through `PATCH /api/orders/lots/:id`. The
-- declaration is then gone and no variance can be computed.
--
-- THE SHAPE: the declaration is frozen beside the measurement, on the same row,
-- and `assayed_at` records when a measured column last moved. Both live on
-- `inventory.lots` because the lot is the physical thing that was weighed; the
-- order line (`orders.lots`) carries the money.
--
-- `declared_content` is generated the way `content` already is, so the variance
-- in fine ounces is `content - declared_content` and no TypeScript adds it up.
--
-- THE ALTERNATIVE REJECTED: append-only measurement rows by stage (ruling 40's
-- parked model). It answers more questions - every re-weigh, in order - but it
-- makes `content` a read over a table instead of a generated column, which is
-- what every price, manifest and settlement in the build already reads. Two
-- snapshot columns and a stamp are the smallest honest shape for the one
-- question the screens ask.
--
-- Two database triggers, because the database stamps facts and code never
-- writes them (the `audit_stamp` precedent):
--   * `declare_stamp` BEFORE INSERT fills `declared_*` from the values the row
--     was created with, so every path that mints a lot - placement, an admin
--     adding a lot, a split, a combine - freezes its declaration without one
--     INSERT statement naming the columns.
--   * `assay_stamp` BEFORE UPDATE sets `assayed_at` when a measured column
--     actually changes.
--
-- Additive and idempotent. `exchange` is neither read nor written.

ALTER TABLE inventory.lots
  ADD COLUMN IF NOT EXISTS declared_unit text,
  ADD COLUMN IF NOT EXISTS declared_quantity numeric,
  ADD COLUMN IF NOT EXISTS declared_pre_melt numeric,
  ADD COLUMN IF NOT EXISTS declared_post_melt numeric,
  ADD COLUMN IF NOT EXISTS declared_purity numeric,
  ADD COLUMN IF NOT EXISTS assayed_at timestamp with time zone;

ALTER TABLE inventory.lots
  ADD COLUMN IF NOT EXISTS declared_content numeric GENERATED ALWAYS AS (
    metals.fine_content(COALESCE(declared_post_melt, declared_pre_melt),
                        declared_unit, declared_purity)
  ) STORED;

CREATE OR REPLACE FUNCTION inventory.declare_stamp() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.declared_unit := COALESCE(NEW.declared_unit, NEW.unit);
  NEW.declared_quantity := COALESCE(NEW.declared_quantity, NEW.quantity);
  NEW.declared_pre_melt := COALESCE(NEW.declared_pre_melt, NEW.pre_melt);
  NEW.declared_post_melt := COALESCE(NEW.declared_post_melt, NEW.post_melt);
  NEW.declared_purity := COALESCE(NEW.declared_purity, NEW.purity);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION inventory.assay_stamp() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (NEW.pre_melt, NEW.post_melt, NEW.purity, NEW.unit, NEW.quantity)
     IS DISTINCT FROM
     (OLD.pre_melt, OLD.post_melt, OLD.purity, OLD.unit, OLD.quantity)
  THEN
    NEW.assayed_at := now();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE TRIGGER declare_stamp BEFORE INSERT ON inventory.lots
  FOR EACH ROW EXECUTE FUNCTION inventory.declare_stamp();

CREATE OR REPLACE TRIGGER assay_stamp BEFORE UPDATE ON inventory.lots
  FOR EACH ROW EXECUTE FUNCTION inventory.assay_stamp();

UPDATE inventory.lots
   SET declared_unit = COALESCE(declared_unit, unit),
       declared_quantity = COALESCE(declared_quantity, quantity),
       declared_pre_melt = COALESCE(declared_pre_melt, pre_melt),
       declared_post_melt = COALESCE(declared_post_melt, post_melt),
       declared_purity = COALESCE(declared_purity, purity)
 WHERE declared_unit IS NULL
    OR declared_quantity IS NULL
    OR (pre_melt IS NOT NULL AND declared_pre_melt IS NULL)
    OR (post_melt IS NOT NULL AND declared_post_melt IS NULL)
    OR (purity IS NOT NULL AND declared_purity IS NULL);

DO $$
DECLARE
  total bigint;
  declared bigint;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE declared_unit IS NOT NULL)
    INTO total, declared FROM inventory.lots;
  RAISE NOTICE 'lots: % of % lot(s) carry a frozen declaration; no lot has been assayed yet (assayed_at is null everywhere a measured column has not moved since)',
    declared, total;
END $$;
