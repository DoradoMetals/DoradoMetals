-- EVERY ADJUSTMENT EDIT AND EVERY ACTIVE-SOURCE SWITCH LEAVES A ROW.
--
-- docs/waves/pricing-resolver.md item 4, from the Pricing audit
-- (docs/design/api-gaps-pricing.md section 1 rows 15, 16, 17). The Adjustment
-- log draws three kinds of event in one list - an adjustment edited, an
-- adjustment cleared, and a metal's active source switched - and nothing
-- recorded any of them. spots.overrides kept only the current row.
--
-- Same shape as rates.rate_history (migration 198), for the same reason: a
-- trigger writes it, so no write path can bypass it and no service has to
-- remember. One row PER CHANGED FIELD, because that is what the log draws.
--
-- AFTER INSERT OR UPDATE OR DELETE, not AFTER UPDATE: a cleared adjustment is
-- a DELETE and the log has to carry it (audit row 17). An INSERT logs the
-- fields that differ from the column defaults, so "set to back 0.20%" appears
-- the first time as well as the second.
--
-- TWO TRIGGERS, ONE TABLE, with source_id nullable (audit row 16): an
-- adjustment event names the pair, an active-source event names the metal
-- only and carries the old and new source id as its values. The label the
-- screen draws is a CASE over `field` in the read, not a column.
--
-- THE ACTOR ON A DELETE cannot come from updated_by_id: that names whoever
-- last edited the row, not whoever cleared it. The DELETE branch resolves
-- app.actor_id the way public.audit_stamp does - regex first so a malformed
-- setting cannot raise 22P02, then a lookup so an id with no user cannot
-- raise 23503 on the foreign key.
--
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS spots.adjustment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_id text NOT NULL REFERENCES metals.metals(id) ON UPDATE CASCADE,
  source_id text REFERENCES spots.sources(id) ON UPDATE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS adjustment_history_changed_at_idx
  ON spots.adjustment_history (changed_at DESC);
CREATE INDEX IF NOT EXISTS adjustment_history_metal_id_idx
  ON spots.adjustment_history (metal_id);

CREATE OR REPLACE FUNCTION spots.actor_now() RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $actor_now$
DECLARE
  raw text := nullif(current_setting('app.actor_id', true), '');
  found uuid;
BEGIN
  IF raw ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
    SELECT u.id INTO found FROM auth.users u WHERE u.id = raw::uuid;
  END IF;
  RETURN found;
END;
$actor_now$;

CREATE OR REPLACE FUNCTION spots.log_adjustment() RETURNS trigger
LANGUAGE plpgsql
AS $log_adjustment$
DECLARE
  cols      text[] := ARRAY['bid_amount', 'ask_amount', 'unit', 'reason',
                            'expires_at', 'expires_at_market_open', 'enabled'];
  before    jsonb;
  after     jsonb;
  metal     text;
  source    text;
  actor     uuid;
  who       text;
  col       text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    before := to_jsonb(OLD);
    after  := '{}'::jsonb;
    metal  := OLD.metal_id;
    source := OLD.source_id;
    actor  := spots.actor_now();
    SELECT u.name INTO who FROM auth.users u WHERE u.id = actor;
  ELSE
    before := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    after  := to_jsonb(NEW);
    metal  := NEW.metal_id;
    source := NEW.source_id;
    actor  := NEW.updated_by_id;
    who    := NEW.updated_by;
  END IF;

  FOREACH col IN ARRAY cols LOOP
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO spots.adjustment_history
             (metal_id, source_id, field, old_value, new_value, actor_id, actor_name)
      VALUES (metal, source, col, before ->> col, after ->> col, actor, who);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$log_adjustment$;

CREATE OR REPLACE TRIGGER adjustment_history
  AFTER INSERT OR UPDATE OR DELETE ON spots.adjustments
  FOR EACH ROW EXECUTE FUNCTION spots.log_adjustment();

CREATE OR REPLACE FUNCTION spots.log_active_source() RETURNS trigger
LANGUAGE plpgsql
AS $log_active_source$
DECLARE
  metal  text;
  before text;
  after  text;
  actor  uuid;
  who    text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    metal  := OLD.metal_id;
    before := OLD.source_id;
    after  := NULL;
    actor  := spots.actor_now();
    SELECT u.name INTO who FROM auth.users u WHERE u.id = actor;
  ELSE
    metal  := NEW.metal_id;
    before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.source_id END;
    after  := NEW.source_id;
    actor  := NEW.updated_by_id;
    who    := NEW.updated_by;
  END IF;

  IF before IS DISTINCT FROM after THEN
    INSERT INTO spots.adjustment_history
           (metal_id, source_id, field, old_value, new_value, actor_id, actor_name)
    VALUES (metal, NULL, 'active_source', before, after, actor, who);
  END IF;

  RETURN NULL;
END;
$log_active_source$;

CREATE OR REPLACE TRIGGER adjustment_history
  AFTER INSERT OR UPDATE OR DELETE ON spots.active_sources
  FOR EACH ROW EXECUTE FUNCTION spots.log_active_source();
