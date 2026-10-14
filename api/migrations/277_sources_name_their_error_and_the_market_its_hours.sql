-- THREE SMALL FACTS THE PRICING DESIGNS NEED.
--
-- 1. KITCO AND LBMA ARE ROWS. The Sources card draws them; neither has a
--    client, so they never tick and read "Never". Both are disabled, sit after
--    nfusion and are nobody's default. A disabled row is skipped by the feed
--    job, and a source with no client never holds a spots.current row, so
--    spots.resolved is unaffected.
--
-- 2. A FAILED POLL KEEPS ITS ERROR. spots.sources.last_error existed and was
--    never written. The feed job now records the provider's message with the
--    failure (shared/observe.ts is the one place that sees it), and the first
--    failure of a run copies it into the tick_failed event's detail. A good
--    tick already clears last_error (stamp_tick). Only the tick_failed branch
--    of the trigger changes.
--
-- 3. THE MARKET IS OPEN OR NOT. spots.market_is_open(at) answers from
--    spots.market_sessions and spots.market_holidays: the session of the
--    weekday in the session's own timezone, no holiday on that local date, and
--    the local time inside [opens_at, closes_at). plpgsql on purpose, as
--    spots.next_market_open is: genesis emits functions before tables.
--
-- `exchange` is neither read nor written.

INSERT INTO spots.sources (id, enabled, sort_order)
VALUES ('kitco', false, 2),
       ('lbma', false, 3)
ON CONFLICT (id) DO NOTHING;

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
    INSERT INTO spots.source_events (source_id, kind, detail)
    VALUES (NEW.id, 'tick_failed', NEW.last_error);
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

CREATE OR REPLACE FUNCTION spots.market_is_open(at timestamp with time zone DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $market_is_open$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM spots.market_sessions ms
      CROSS JOIN LATERAL (SELECT at AT TIME ZONE ms.tz AS local_at) l
     WHERE ms.weekday = EXTRACT(DOW FROM l.local_at)::smallint
       AND l.local_at::time >= ms.opens_at
       AND l.local_at::time < ms.closes_at
       AND NOT EXISTS (SELECT 1 FROM spots.market_holidays h
                        WHERE h.observed_on = l.local_at::date));
END;
$market_is_open$;
