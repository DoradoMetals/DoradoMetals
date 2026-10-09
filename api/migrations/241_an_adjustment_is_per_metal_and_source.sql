-- AN ADJUSTMENT IS SIGNED, PER (METAL, SOURCE), AND MAY EXPIRE AT MARKET OPEN.
--
-- docs/waves/pricing-resolver.md item 3, from the Pricing audit
-- (docs/design/api-gaps-pricing.md section 1 rows 6, 8, 9 and section 3
-- answers 1, 3, 5, 6).
--
-- WHAT spots.overrides GOT WRONG. It was one row per metal holding an
-- ABSOLUTE bid/ask pair. An absolute price does not track the feed, and the
-- screen's "back 0.20%" means follow the feed, 0.20% under. Wrong grain and
-- wrong kind. spots.overrides is NOT dropped here - migration 245 maps its
-- rows into this table and the old table stays until the data is verified.
--
-- SIGNED AMOUNTS, so "up" and "back" are the sign and not a second column.
-- `unit` defaults to 'percent' and allows 'dollars', so a dollar adjustment
-- needs no migration. A percent amount is in PERCENT UNITS: 0.20 means 0.20%,
-- applied as amount / 100.
--
-- STORED AND DORMANT when the source is not the metal's active one (section 3
-- answer 5). That is what a Gold-on-a-standby-feed row is for. The resolver
-- (migration 244) ignores it; nothing refuses the write.
--
-- THE MARKET CALENDAR IS ROWS (ruling 116, section 3 answer 6), seeded with
-- the COMEX regular session: Monday to Friday, 08:30 to 13:30 America/New_York,
-- minus the exchange holidays. `expires_at_market_open` stores the INTENT so
-- the instant is recomputed from the calendar every read and never frozen
-- wrong; spots.next_market_open is that one expression.
--
-- The function is plpgsql, not sql, on purpose: genesis emits every function
-- BEFORE the tables (a STORED generated column resolves one at CREATE TABLE
-- time), and a LANGUAGE sql body naming spots.market_sessions would fail to
-- parse there. A plpgsql body is not parsed until it runs.
--
-- `observed_on`, not `on`: `on` is a reserved word and would need quoting at
-- every use.
--
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS spots.market_sessions (
  weekday smallint PRIMARY KEY,
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  tz text NOT NULL,
  CONSTRAINT market_sessions_weekday_range CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT market_sessions_opens_before_closes CHECK (opens_at < closes_at)
);

INSERT INTO spots.market_sessions (weekday, opens_at, closes_at, tz)
VALUES (1, '08:30', '13:30', 'America/New_York'),
       (2, '08:30', '13:30', 'America/New_York'),
       (3, '08:30', '13:30', 'America/New_York'),
       (4, '08:30', '13:30', 'America/New_York'),
       (5, '08:30', '13:30', 'America/New_York')
ON CONFLICT (weekday) DO NOTHING;

CREATE TABLE IF NOT EXISTS spots.market_holidays (
  observed_on date PRIMARY KEY,
  name text NOT NULL
);

INSERT INTO spots.market_holidays (observed_on, name)
VALUES ('2026-01-01', 'New Year''s Day'),
       ('2026-01-19', 'Martin Luther King Jr. Day'),
       ('2026-02-16', 'Washington''s Birthday'),
       ('2026-04-03', 'Good Friday'),
       ('2026-05-25', 'Memorial Day'),
       ('2026-06-19', 'Juneteenth'),
       ('2026-07-03', 'Independence Day'),
       ('2026-09-07', 'Labor Day'),
       ('2026-11-26', 'Thanksgiving Day'),
       ('2026-12-25', 'Christmas Day'),
       ('2027-01-01', 'New Year''s Day'),
       ('2027-01-18', 'Martin Luther King Jr. Day'),
       ('2027-02-15', 'Washington''s Birthday'),
       ('2027-03-26', 'Good Friday'),
       ('2027-05-31', 'Memorial Day'),
       ('2027-06-18', 'Juneteenth'),
       ('2027-07-05', 'Independence Day'),
       ('2027-09-06', 'Labor Day'),
       ('2027-11-25', 'Thanksgiving Day'),
       ('2027-12-24', 'Christmas Day')
ON CONFLICT (observed_on) DO NOTHING;

CREATE OR REPLACE FUNCTION spots.next_market_open(after timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
AS $next_market_open$
DECLARE
  instant timestamp with time zone;
BEGIN
  SELECT min(o.at) INTO instant
    FROM (
      SELECT ((d.day + ms.opens_at) AT TIME ZONE ms.tz) AS at
        FROM generate_series((after AT TIME ZONE 'UTC')::date - 1,
                             (after AT TIME ZONE 'UTC')::date + 21,
                             interval '1 day') AS g(day)
        CROSS JOIN LATERAL (SELECT g.day::date AS day) d
        JOIN spots.market_sessions ms
          ON ms.weekday = EXTRACT(DOW FROM d.day)::smallint
       WHERE NOT EXISTS (SELECT 1 FROM spots.market_holidays h WHERE h.observed_on = d.day)
    ) o
   WHERE o.at > after;
  RETURN instant;
END;
$next_market_open$;

CREATE TABLE IF NOT EXISTS spots.adjustments (
  metal_id text NOT NULL REFERENCES metals.metals(id) ON UPDATE CASCADE,
  source_id text NOT NULL REFERENCES spots.sources(id) ON UPDATE CASCADE,
  bid_amount numeric DEFAULT 0 NOT NULL,
  ask_amount numeric DEFAULT 0 NOT NULL,
  unit text DEFAULT 'percent' NOT NULL,
  reason text DEFAULT '' NOT NULL,
  expires_at timestamp with time zone,
  expires_at_market_open boolean DEFAULT false NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by text DEFAULT '' NOT NULL,
  updated_by text DEFAULT '' NOT NULL,
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id),
  CONSTRAINT adjustments_pkey PRIMARY KEY (metal_id, source_id),
  CONSTRAINT adjustments_unit CHECK (unit IN ('percent', 'dollars')),
  CONSTRAINT adjustments_one_expiry CHECK (NOT (expires_at_market_open AND expires_at IS NOT NULL))
);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON spots.adjustments
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
