-- A RATE CHANGE NAMES ITS METAL AND ITS BAND, AND OUTLIVES THE ROW.
--
-- The Rates page edits a metal's bands as one list and draws a change log of
-- `Gold . 5-20 ozt . scrap 88% -> 90%` (docs/design/api-gaps-pricing.md
-- rows 30 and 31). rates.rate_history (migration 198) recorded only rate_id,
-- so the band had to be read off today's row - wrong once the band itself
-- moved - and its foreign key was ON DELETE CASCADE, so removing a band
-- deleted every change ever made to it.
--
-- THE BAND IS COPIED ONTO THE CHANGE. metal_id, unit, min_qty and max_qty are
-- the band as it stood when the change was made: NEW for an insert or an
-- edit, OLD for a removal. Existing rows are filled from their rate's current
-- band, which is the best fact left for them; dev holds none.
--
-- THE CHANGE OUTLIVES THE BAND. rate_id becomes nullable and its foreign key
-- ON DELETE SET NULL, so a removed band keeps its trail. The trigger now runs
-- AFTER INSERT OR UPDATE OR DELETE, the 242 pattern: a band added logs its two
-- percentages, a band removed logs them going, and the actor of a removal is
-- spots.actor_now() because updated_by_id names whoever last edited the row.
--
-- THE OVERLAP CONSTRAINT IS DEFERRABLE. Replacing a metal's bands is one
-- statement that edits, adds and removes rows. A non-deferrable exclusion
-- constraint is checked row by row, so moving 0-5 / 5+ to 0-10 / 10+ trips
-- over the old 5+ before it is moved. DEFERRABLE INITIALLY IMMEDIATE checks
-- at the end of that statement; nothing is ever deferred past it. The
-- constraint is re-created with the same name and the same definition.
--
-- changed_at gets the index the change log's time window reads (row 31).
--
-- `exchange` is neither read nor written.

ALTER TABLE rates.rate_history
  ADD COLUMN IF NOT EXISTS metal_id text REFERENCES metals.metals(id) ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS min_qty numeric,
  ADD COLUMN IF NOT EXISTS max_qty numeric;

ALTER TABLE rates.rate_history ALTER COLUMN rate_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'rate_history_rate_id_fkey'
                AND conrelid = 'rates.rate_history'::regclass
                AND confdeltype = 'c') THEN
    ALTER TABLE rates.rate_history DROP CONSTRAINT rate_history_rate_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'rate_history_rate_id_fkey'
                    AND conrelid = 'rates.rate_history'::regclass) THEN
    ALTER TABLE rates.rate_history ADD CONSTRAINT rate_history_rate_id_fkey
      FOREIGN KEY (rate_id) REFERENCES rates.rates(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'rates_no_overlap_qty'
                AND conrelid = 'rates.rates'::regclass
                AND NOT condeferrable) THEN
    ALTER TABLE rates.rates DROP CONSTRAINT rates_no_overlap_qty;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'rates_no_overlap_qty'
                    AND conrelid = 'rates.rates'::regclass) THEN
    ALTER TABLE rates.rates ADD CONSTRAINT rates_no_overlap_qty
      EXCLUDE USING gist (metal_id WITH =, unit WITH =, numrange(min_qty, max_qty, '[)') WITH &&)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rate_history_changed_at_idx
  ON rates.rate_history (changed_at DESC);
CREATE INDEX IF NOT EXISTS rate_history_metal_id_idx
  ON rates.rate_history (metal_id);

UPDATE rates.rate_history h
   SET metal_id = r.metal_id,
       unit = r.unit,
       min_qty = r.min_qty,
       max_qty = r.max_qty
  FROM rates.rates r
 WHERE r.id = h.rate_id
   AND h.metal_id IS NULL;

CREATE OR REPLACE FUNCTION rates.log_change() RETURNS trigger
LANGUAGE plpgsql
AS $rate_history$
DECLARE
  cols   text[];
  before jsonb;
  after  jsonb;
  band   rates.rates;
  rate   uuid;
  actor  uuid;
  who    text;
  col    text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    cols   := ARRAY['metal_id', 'unit', 'min_qty', 'max_qty', 'scrap_pct', 'bullion_pct'];
    before := to_jsonb(OLD);
    after  := to_jsonb(NEW);
    band   := NEW;
    rate   := NEW.id;
    actor  := NEW.updated_by_id;
    who    := NEW.updated_by;
  ELSIF TG_OP = 'INSERT' THEN
    cols   := ARRAY['scrap_pct', 'bullion_pct'];
    before := '{}'::jsonb;
    after  := to_jsonb(NEW);
    band   := NEW;
    rate   := NEW.id;
    actor  := NEW.updated_by_id;
    who    := NEW.updated_by;
  ELSE
    cols   := ARRAY['scrap_pct', 'bullion_pct'];
    before := to_jsonb(OLD);
    after  := '{}'::jsonb;
    band   := OLD;
    rate   := NULL;
    actor  := spots.actor_now();
    SELECT u.name INTO who FROM auth.users u WHERE u.id = actor;
  END IF;

  FOREACH col IN ARRAY cols LOOP
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO rates.rate_history (rate_id, field, old_value, new_value, actor_id, actor_name,
                                      metal_id, unit, min_qty, max_qty)
      VALUES (rate, col, before ->> col, after ->> col, actor, who,
              band.metal_id, band.unit, band.min_qty, band.max_qty);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$rate_history$;

CREATE OR REPLACE TRIGGER rate_history AFTER INSERT OR UPDATE OR DELETE ON rates.rates
  FOR EACH ROW EXECUTE FUNCTION rates.log_change();
