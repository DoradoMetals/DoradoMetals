-- THE RATE TRAIL'S TRIGGER NAMES NO TABLE TYPE.
--
-- Migration 270 declared a `rates.rates` row variable in rates.log_change().
-- A row type is resolved when the function is CREATED, and genesis emits
-- every function before the tables (see migration 241's note on
-- spots.next_market_open), so building the schema from nothing failed with
-- "type rates.rates does not exist". The band is four scalars instead; the
-- behaviour is unchanged.
--
-- `exchange` is neither read nor written.

CREATE OR REPLACE FUNCTION rates.log_change() RETURNS trigger
LANGUAGE plpgsql
AS $rate_history$
DECLARE
  cols   text[];
  before jsonb;
  after  jsonb;
  b_metal text;
  b_unit  text;
  b_min   numeric;
  b_max   numeric;
  rate   uuid;
  actor  uuid;
  who    text;
  col    text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    cols   := ARRAY['metal_id', 'unit', 'min_qty', 'max_qty', 'scrap_pct', 'bullion_pct'];
    before := to_jsonb(OLD);
    after  := to_jsonb(NEW);
    b_metal := NEW.metal_id; b_unit := NEW.unit; b_min := NEW.min_qty; b_max := NEW.max_qty;
    rate   := NEW.id;
    actor  := NEW.updated_by_id;
    who    := NEW.updated_by;
  ELSIF TG_OP = 'INSERT' THEN
    cols   := ARRAY['scrap_pct', 'bullion_pct'];
    before := '{}'::jsonb;
    after  := to_jsonb(NEW);
    b_metal := NEW.metal_id; b_unit := NEW.unit; b_min := NEW.min_qty; b_max := NEW.max_qty;
    rate   := NEW.id;
    actor  := NEW.updated_by_id;
    who    := NEW.updated_by;
  ELSE
    cols   := ARRAY['scrap_pct', 'bullion_pct'];
    before := to_jsonb(OLD);
    after  := '{}'::jsonb;
    b_metal := OLD.metal_id; b_unit := OLD.unit; b_min := OLD.min_qty; b_max := OLD.max_qty;
    rate   := NULL;
    actor  := spots.actor_now();
    SELECT u.name INTO who FROM auth.users u WHERE u.id = actor;
  END IF;

  FOREACH col IN ARRAY cols LOOP
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO rates.rate_history (rate_id, field, old_value, new_value, actor_id, actor_name,
                                      metal_id, unit, min_qty, max_qty)
      VALUES (rate, col, before ->> col, after ->> col, actor, who,
              b_metal, b_unit, b_min, b_max);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$rate_history$;

CREATE OR REPLACE TRIGGER rate_history AFTER INSERT OR UPDATE OR DELETE ON rates.rates
  FOR EACH ROW EXECUTE FUNCTION rates.log_change();
