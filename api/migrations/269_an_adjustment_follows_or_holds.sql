-- AN ADJUSTMENT EITHER FOLLOWS THE FEED OR HOLDS A PAIR, AND STALE PRICES NOTHING.
--
-- FOLLOWUPS "Pricing design review follow-ups" (2026-10-14), freeze and
-- adjustment mode, plus three rulings Jacob made the same week:
--
--   - An adjustment has a Mode, Adjust or Freeze. There is no paused state:
--     cancelling an adjustment is deleting it, so `enabled` goes.
--   - Freeze holds a metal's last bid/ask and ignores new ticks until it ends.
--     A dollar adjustment (migration 245) still tracks the feed; a freeze
--     does not.
--   - Stale pricing is refused and shown.
--
-- MODE IS A COLUMN ON THE ROW, NOT A SECOND TABLE. One adjustment per (metal,
-- source) stays the grain, so the metal page edits one row whatever its mode.
-- `frozen_bid` / `frozen_ask` are the absolute pair a freeze holds and are
-- NULL on an adjust row; a CHECK says a freeze always has both.
--
-- THE DATABASE FILLS THE FROZEN PAIR. A freeze that names no pair holds the
-- metal's last resolved one, read off spots.resolved by a BEFORE trigger
-- before the row changes - so the client sends a mode and an id, never a
-- price it read off its own screen (ruling 10), and "Freeze all" is one
-- INSERT. An explicit pair is kept. Leaving freeze clears the pair.
--
-- A FREEZE IS PER METAL. A freeze row on any source holds the metal; an
-- adjust row applies only on the metal's own source and is dormant on the
-- others, as before.
--
-- THE METAL'S SOURCE is its spots.active_sources row when one exists, else
-- the default (migration 267). When that source is off, the next enabled one
-- in sort_order stands in - that is what sort_order is for. No enabled source
-- at all still resolves to NULL.
--
-- STALE PRICES NOTHING. `bid` and `ask` are NULL while the metal is stale,
-- whether its feed is off or its last tick is older than
-- spots.settings.stale_after_seconds, so every pricing statement already
-- joined to this view refuses through its `unpriceable` list. A frozen metal
-- is never stale: holding the pair through a dead feed is what freeze is for.
-- `last_bid` / `last_ask` are the pair the view would apply if staleness were
-- ignored - the figure the Spots card shows next to its stale badge, and the
-- figure a freeze holds. `last_tick_at` is the metal's own last written tick.
--
-- `state` is live | stale | frozen. `manual` is gone: an adjusted feed that
-- is ticking is live.
--
-- THE COLUMN DROP is guarded. Any row with enabled = false is a paused
-- adjustment, which no longer exists as a concept; turning one into a live
-- adjustment or deleting it is a decision, so the migration refuses rather
-- than choosing. dev holds no adjustment rows.
--
-- `exchange` is neither read nor written.

ALTER TABLE spots.adjustments
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'adjust' NOT NULL,
  ADD COLUMN IF NOT EXISTS frozen_bid numeric,
  ADD COLUMN IF NOT EXISTS frozen_ask numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'adjustments_mode'
                    AND conrelid = 'spots.adjustments'::regclass) THEN
    ALTER TABLE spots.adjustments ADD CONSTRAINT adjustments_mode
      CHECK (mode IN ('adjust', 'freeze'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'adjustments_a_freeze_holds_a_pair'
                    AND conrelid = 'spots.adjustments'::regclass) THEN
    ALTER TABLE spots.adjustments ADD CONSTRAINT adjustments_a_freeze_holds_a_pair
      CHECK (mode <> 'freeze' OR (frozen_bid IS NOT NULL AND frozen_ask IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS adjustments_freeze_metal_id_idx
  ON spots.adjustments (metal_id) WHERE mode = 'freeze';

CREATE OR REPLACE VIEW spots.resolved AS
SELECT s.metal_id,
       src.id AS source_id,
       s.bid AS feed_bid,
       s.ask AS feed_ask,
       CASE WHEN st.state <> 'stale' THEN p.bid END AS bid,
       CASE WHEN st.state <> 'stale' THEN p.ask END AS ask,
       s.percent_change,
       s.dollar_change,
       s.bid_dollar_change,
       s.bid_percent_change,
       s.ask_dollar_change,
       s.ask_percent_change,
       s.updated_at,
       st.state,
       s.updated_at AS last_tick_at,
       p.bid AS last_bid,
       p.ask AS last_ask,
       CASE WHEN frz.metal_id IS NOT NULL THEN 'freeze'
            WHEN adj.metal_id IS NOT NULL THEN 'adjust' END AS mode,
       a.source_id IS NULL AS follows_default
  FROM spots.spots s
  LEFT JOIN spots.active_sources a ON a.metal_id = s.metal_id
  LEFT JOIN LATERAL (
         SELECT x.id
           FROM spots.sources x
          WHERE x.enabled
          ORDER BY COALESCE(x.id = a.source_id, false) DESC,
                   x.is_default DESC,
                   x.sort_order ASC,
                   x.id ASC
          LIMIT 1) src ON TRUE
  LEFT JOIN spots.adjustments adj
         ON adj.metal_id = s.metal_id
        AND adj.source_id = src.id
        AND adj.mode = 'adjust'
        AND (adj.expires_at IS NULL OR adj.expires_at > now())
        AND (NOT adj.expires_at_market_open
             OR COALESCE(spots.next_market_open(adj.updated_at), 'infinity'::timestamptz) > now())
  LEFT JOIN LATERAL (
         SELECT f.metal_id, f.frozen_bid, f.frozen_ask
           FROM spots.adjustments f
          WHERE f.metal_id = s.metal_id
            AND f.mode = 'freeze'
            AND (f.expires_at IS NULL OR f.expires_at > now())
            AND (NOT f.expires_at_market_open
                 OR COALESCE(spots.next_market_open(f.updated_at), 'infinity'::timestamptz) > now())
          ORDER BY f.updated_at DESC, f.source_id ASC
          LIMIT 1) frz ON TRUE
  CROSS JOIN LATERAL (
         SELECT CASE WHEN frz.metal_id IS NOT NULL THEN frz.frozen_bid
                     WHEN src.id IS NULL THEN NULL
                     WHEN adj.metal_id IS NULL THEN s.bid
                     WHEN adj.unit = 'dollars' THEN s.bid + adj.bid_amount
                     ELSE s.bid * (1 + adj.bid_amount / 100) END AS bid,
                CASE WHEN frz.metal_id IS NOT NULL THEN frz.frozen_ask
                     WHEN src.id IS NULL THEN NULL
                     WHEN adj.metal_id IS NULL THEN s.ask
                     WHEN adj.unit = 'dollars' THEN s.ask + adj.ask_amount
                     ELSE s.ask * (1 + adj.ask_amount / 100) END AS ask) p
  CROSS JOIN LATERAL (
         SELECT CASE WHEN frz.metal_id IS NOT NULL THEN 'frozen'
                     WHEN src.id IS NULL THEN 'stale'
                     WHEN s.updated_at < now() - make_interval(secs =>
                            (SELECT ss.stale_after_seconds FROM spots.settings ss LIMIT 1))
                       THEN 'stale'
                     ELSE 'live' END AS state) st;

CREATE OR REPLACE FUNCTION spots.hold_frozen_pair() RETURNS trigger
LANGUAGE plpgsql
AS $hold_frozen_pair$
DECLARE
  held_bid numeric;
  held_ask numeric;
BEGIN
  IF NEW.mode = 'freeze' THEN
    IF NEW.frozen_bid IS NULL OR NEW.frozen_ask IS NULL THEN
      SELECT r.last_bid, r.last_ask INTO held_bid, held_ask
        FROM spots.resolved r
       WHERE r.metal_id = NEW.metal_id;
      NEW.frozen_bid := COALESCE(NEW.frozen_bid, held_bid);
      NEW.frozen_ask := COALESCE(NEW.frozen_ask, held_ask);
    END IF;
  ELSE
    NEW.frozen_bid := NULL;
    NEW.frozen_ask := NULL;
  END IF;
  RETURN NEW;
END;
$hold_frozen_pair$;

CREATE OR REPLACE TRIGGER hold_frozen_pair BEFORE INSERT OR UPDATE ON spots.adjustments
  FOR EACH ROW EXECUTE FUNCTION spots.hold_frozen_pair();

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
    CONTINUE WHEN TG_OP = 'INSERT' AND after -> col = 'null'::jsonb;
    CONTINUE WHEN TG_OP = 'DELETE' AND before -> col = 'null'::jsonb;
    IF before -> col IS DISTINCT FROM after -> col THEN
      INSERT INTO spots.adjustment_history
             (metal_id, source_id, field, old_value, new_value, actor_id, actor_name)
      VALUES (metal, source, col, before ->> col, after ->> col, actor, who);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$log_adjustment$;

DO $$
DECLARE
  paused integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'spots' AND table_name = 'adjustments'
                AND column_name = 'enabled') THEN
    EXECUTE 'SELECT count(*) FROM spots.adjustments WHERE NOT enabled' INTO paused;
    IF paused > 0 THEN
      RAISE EXCEPTION USING
        MESSAGE = format('%s spots.adjustments row(s) are paused (enabled = false), and a '
                         'paused adjustment no longer exists; make each live or delete it '
                         'before this migration drops the column', paused);
    END IF;
    ALTER TABLE spots.adjustments DROP COLUMN enabled;
  END IF;
END $$;
