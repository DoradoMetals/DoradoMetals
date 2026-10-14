-- A FEED THAT FAILS, RECOVERS OR IS SWITCHED LEAVES A ROW.
--
-- FOLLOWUPS "Pricing design review follow-ups" (2026-10-14), source events.
-- The metal page Activity draws feed events - "recovered after 3 failed
-- polls", a feed turned off, a new default - and spots.sources held only the
-- latest last_tick_at / last_attempt_at, which say nothing about what
-- happened in between.
--
-- TRANSITIONS, NOT TICKS. A feed polls every tick_seconds; a row per poll is
-- noise and grows without bound. A row is written on the first tick a source
-- ever records (tick_ok), on the first failure after a good poll
-- (tick_failed), on the first good poll after failures (recovered, with the
-- count), and on an admin turning it on or off or making it the default.
--
-- failed_polls IS THE COUNT a recovery reports. It is a fact about the run of
-- failures in progress: the feed adds one per failed poll and a good tick sets
-- it back to 0. The trigger reads the edge - 0 to 1 is the first failure,
-- above 0 to 0 is the recovery - so the feed's own statements stay one-line
-- UPDATEs and cannot forget to log.
--
-- ONE TRIGGER WRITES EVERY KIND, the 242 pattern: no write path can bypass
-- it. The actor is spots.actor_now() (migration 242), not NEW.updated_by_id,
-- which names whoever last touched the row when the writer has no actor. The
-- feed runs with none, so its rows carry none; an admin's PATCH carries the
-- admin.
--
-- `exchange` is neither read nor written.

ALTER TABLE spots.sources
  ADD COLUMN IF NOT EXISTS failed_polls integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'sources_failed_polls_nonneg'
                    AND conrelid = 'spots.sources'::regclass) THEN
    ALTER TABLE spots.sources ADD CONSTRAINT sources_failed_polls_nonneg
      CHECK (failed_polls >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS spots.source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES spots.sources(id) ON UPDATE CASCADE,
  kind text NOT NULL,
  detail text,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT source_events_kind CHECK (kind IN ('tick_ok', 'tick_failed', 'recovered',
                                                'enabled', 'disabled', 'made_default'))
);

CREATE INDEX IF NOT EXISTS source_events_source_id_created_at_idx
  ON spots.source_events (source_id, created_at DESC);

CREATE OR REPLACE FUNCTION spots.log_source_event() RETURNS trigger
LANGUAGE plpgsql
AS $log_source_event$
DECLARE
  actor uuid := spots.actor_now();
  who   text;
BEGIN
  SELECT u.name INTO who FROM auth.users u WHERE u.id = actor;

  IF OLD.last_tick_at IS NULL AND NEW.last_tick_at IS NOT NULL AND OLD.failed_polls = 0 THEN
    INSERT INTO spots.source_events (source_id, kind) VALUES (NEW.id, 'tick_ok');
  END IF;

  IF OLD.failed_polls = 0 AND NEW.failed_polls > 0 THEN
    INSERT INTO spots.source_events (source_id, kind) VALUES (NEW.id, 'tick_failed');
  END IF;

  IF OLD.failed_polls > 0 AND NEW.failed_polls = 0 THEN
    INSERT INTO spots.source_events (source_id, kind, detail)
    VALUES (NEW.id, 'recovered', format('recovered after %s failed polls', OLD.failed_polls));
  END IF;

  IF OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    INSERT INTO spots.source_events (source_id, kind, actor_id, actor_name)
    VALUES (NEW.id, CASE WHEN NEW.enabled THEN 'enabled' ELSE 'disabled' END, actor, who);
  END IF;

  IF NEW.is_default AND NOT OLD.is_default THEN
    INSERT INTO spots.source_events (source_id, kind, actor_id, actor_name)
    VALUES (NEW.id, 'made_default', actor, who);
  END IF;

  RETURN NULL;
END;
$log_source_event$;

CREATE OR REPLACE TRIGGER source_events
  AFTER UPDATE ON spots.sources
  FOR EACH ROW EXECUTE FUNCTION spots.log_source_event();
