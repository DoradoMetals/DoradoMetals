-- AN AUDIT FACT NAMES ITS ACTOR BY ID, NEVER BY NAME.
--
-- Ruling 127. rates.rate_history (198), spots.adjustment_history (242) and
-- spots.source_events (268) each stored actor_name beside actor_id, copied
-- from the user at the time of the change. A renamed user then reads as the
-- old name on every past row. The id is the fact; the name is looked up when
-- a screen draws it (GET /api/users/names).
--
-- THE GUARD runs first. A stored name that differs from the current name of
-- its actor, or a name with no actor, is a fact the id cannot give back, so
-- the migration refuses rather than drop it.
--
-- The four trigger functions are rewritten without the name; their triggers
-- stay bound to them, so no CREATE TRIGGER is needed.
--
-- The drops lose nothing: the guard proves each stored name equals
-- auth.users.name for its actor_id. The pre-migration pg_dump is the backup.
--
-- `exchange` is neither read nor written.

DO $guard$
DECLARE
  drift bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'rates' AND table_name = 'rate_history'
                AND column_name = 'actor_name') THEN
    EXECUTE $q$
      SELECT count(*) FROM rates.rate_history h
        LEFT JOIN auth.users u ON u.id = h.actor_id
       WHERE h.actor_name IS DISTINCT FROM u.name
    $q$ INTO drift;
    IF drift > 0 THEN
      RAISE EXCEPTION 'rates.rate_history: % rows store a name that is not the current name of their actor', drift;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'spots' AND table_name = 'adjustment_history'
                AND column_name = 'actor_name') THEN
    EXECUTE $q$
      SELECT count(*) FROM spots.adjustment_history h
        LEFT JOIN auth.users u ON u.id = h.actor_id
       WHERE h.actor_name IS DISTINCT FROM u.name
    $q$ INTO drift;
    IF drift > 0 THEN
      RAISE EXCEPTION 'spots.adjustment_history: % rows store a name that is not the current name of their actor', drift;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'spots' AND table_name = 'source_events'
                AND column_name = 'actor_name') THEN
    EXECUTE $q$
      SELECT count(*) FROM spots.source_events e
        LEFT JOIN auth.users u ON u.id = e.actor_id
       WHERE e.actor_name IS DISTINCT FROM u.name
    $q$ INTO drift;
    IF drift > 0 THEN
      RAISE EXCEPTION 'spots.source_events: % rows store a name that is not the current name of their actor', drift;
    END IF;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION spots.log_active_source() RETURNS trigger
LANGUAGE plpgsql
AS $log_active_source$
DECLARE
  metal  text;
  before text;
  after  text;
  actor  uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    metal  := OLD.metal_id;
    before := OLD.source_id;
    after  := NULL;
    actor  := spots.actor_now();
  ELSE
    metal  := NEW.metal_id;
    before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.source_id END;
    after  := NEW.source_id;
    actor  := NEW.updated_by_id;
  END IF;

  IF before IS DISTINCT FROM after THEN
    INSERT INTO spots.adjustment_history
           (metal_id, source_id, field, old_value, new_value, actor_id)
    VALUES (metal, NULL, 'active_source', before, after, actor);
  END IF;

  RETURN NULL;
END;
$log_active_source$;

CREATE OR REPLACE FUNCTION spots.log_adjustment() RETURNS trigger
LANGUAGE plpgsql
AS $log_adjustment$
DECLARE
  cols      text[] := ARRAY['mode', 'bid_amount', 'ask_amount', 'unit', 'frozen_bid',
                            'frozen_ask', 'reason', 'expires_at', 'expires_at_market_open'];
  before    jsonb;
  after     jsonb;
  metal     text;
  source    text;
  actor     uuid;
  col       text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    before := to_jsonb(OLD);
    after  := '{}'::jsonb;
    metal  := OLD.metal_id;
    source := OLD.source_id;
    actor  := spots.actor_now();
  ELSE
    before := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    after  := to_jsonb(NEW);
    metal  := NEW.metal_id;
    source := NEW.source_id;
    actor  := NEW.updated_by_id;
  END IF;

  FOREACH col IN ARRAY cols LOOP
    CONTINUE WHEN TG_OP = 'INSERT' AND after -> col = 'null'::jsonb;
    CONTINUE WHEN TG_OP = 'DELETE' AND before -> col = 'null'::jsonb;
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO spots.adjustment_history
             (metal_id, source_id, field, old_value, new_value, actor_id)
      VALUES (metal, source, col, before ->> col, after ->> col, actor);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$log_adjustment$;

CREATE OR REPLACE FUNCTION rates.log_change() RETURNS trigger
LANGUAGE plpgsql
AS $log_change$
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
  col    text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    cols   := ARRAY['metal_id', 'unit', 'min_qty', 'max_qty', 'scrap_pct', 'bullion_pct'];
    before := to_jsonb(OLD);
    after  := to_jsonb(NEW);
    b_metal := NEW.metal_id; b_unit := NEW.unit; b_min := NEW.min_qty; b_max := NEW.max_qty;
    rate   := NEW.id;
    actor  := NEW.updated_by_id;
  ELSIF TG_OP = 'INSERT' THEN
    cols   := ARRAY['scrap_pct', 'bullion_pct'];
    before := '{}'::jsonb;
    after  := to_jsonb(NEW);
    b_metal := NEW.metal_id; b_unit := NEW.unit; b_min := NEW.min_qty; b_max := NEW.max_qty;
    rate   := NEW.id;
    actor  := NEW.updated_by_id;
  ELSE
    cols   := ARRAY['scrap_pct', 'bullion_pct'];
    before := to_jsonb(OLD);
    after  := '{}'::jsonb;
    b_metal := OLD.metal_id; b_unit := OLD.unit; b_min := OLD.min_qty; b_max := OLD.max_qty;
    rate   := NULL;
    actor  := spots.actor_now();
  END IF;

  FOREACH col IN ARRAY cols LOOP
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO rates.rate_history (rate_id, field, old_value, new_value, actor_id,
                                      metal_id, unit, min_qty, max_qty)
      VALUES (rate, col, before ->> col, after ->> col, actor,
              b_metal, b_unit, b_min, b_max);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$log_change$;

CREATE OR REPLACE FUNCTION spots.log_source_event() RETURNS trigger
LANGUAGE plpgsql
AS $log_source_event$
DECLARE
  actor uuid := spots.actor_now();
BEGIN
  IF OLD.last_tick_at IS NULL AND NEW.last_tick_at IS NOT NULL AND OLD.failed_polls = 0 THEN
    INSERT INTO spots.source_events (source_id, kind) VALUES (NEW.id, 'tick_ok');
  END IF;

  IF OLD.failed_polls = 0 AND NEW.failed_polls > 0 THEN
    INSERT INTO spots.source_events (source_id, kind, detail)
    VALUES (NEW.id, 'tick_failed', NEW.last_error);
  END IF;

  IF OLD.failed_polls > 0 AND NEW.failed_polls = 0 THEN
    INSERT INTO spots.source_events (source_id, kind, detail)
    VALUES (NEW.id, 'recovered', format('recovered after %s failed polls', OLD.failed_polls));
  END IF;

  IF OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    INSERT INTO spots.source_events (source_id, kind, actor_id)
    VALUES (NEW.id, CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END, actor);
  END IF;

  IF NEW.is_default AND NOT OLD.is_default THEN
    INSERT INTO spots.source_events (source_id, kind, actor_id)
    VALUES (NEW.id, 'made_default', actor);
  END IF;

  RETURN NULL;
END;
$log_source_event$;

ALTER TABLE rates.rate_history DROP COLUMN IF EXISTS actor_name;
ALTER TABLE spots.adjustment_history DROP COLUMN IF EXISTS actor_name;
ALTER TABLE spots.source_events DROP COLUMN IF EXISTS actor_name;
