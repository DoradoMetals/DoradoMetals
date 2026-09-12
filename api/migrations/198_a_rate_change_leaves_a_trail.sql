-- A rate change now leaves a trail: who changed which field on which
-- rates.rates row, and its old and new value
-- (docs/design/rates-spots-screens.md #1, Rate History). Same shape as the
-- audit_stamp precedent: a trigger writes it, not application code, so no
-- write path can bypass it and no service has to remember to log one.
--
-- One row PER CHANGED FIELD rather than one row per UPDATE statement, because
-- that is what the History drawer draws - "scrap_pct changed from 3.5% to 4%
-- by Dana" - and a jsonb diff on read would make every drawer open redo the
-- diffing this trigger already did once, at write time. audit_stamp's own six
-- columns are not logged: they are bookkeeping about the write, not a rate
-- changing.
--
-- AFTER UPDATE, not BEFORE: it has to see what audit_stamp actually wrote to
-- updated_by / updated_by_id, and every BEFORE trigger on a statement runs
-- before every AFTER trigger regardless of name, so NEW already carries the
-- resolved actor by the time this one fires.
--
-- The existing CRUD is untouched: create, read, update and delete on
-- rates.rates still go through #db/rates/repo.ts exactly as before.

CREATE TABLE IF NOT EXISTS rates.rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id uuid NOT NULL REFERENCES rates.rates(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_history_rate_id_idx ON rates.rate_history (rate_id);

CREATE OR REPLACE FUNCTION rates.log_change() RETURNS trigger
LANGUAGE plpgsql
AS $rate_history$
DECLARE
  cols   text[] := ARRAY['metal_id', 'unit', 'min_qty', 'max_qty', 'scrap_pct', 'bullion_pct'];
  before jsonb := to_jsonb(OLD);
  after  jsonb := to_jsonb(NEW);
  col    text;
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO rates.rate_history (rate_id, field, old_value, new_value, actor_id, actor_name)
      VALUES (NEW.id, col, before ->> col, after ->> col, NEW.updated_by_id, NEW.updated_by);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$rate_history$;

CREATE OR REPLACE TRIGGER rate_history AFTER UPDATE ON rates.rates
  FOR EACH ROW EXECUTE FUNCTION rates.log_change();
