-- A LEAD'S STAGE BECOMES THREE MOMENTS INSTEAD OF THREE BOOLEANS.
--
-- leads.leads.contacted / responded / converted say THAT a stage was reached
-- and never WHEN. The Activity feed draws `Marked Richard Meyer contacted ·
-- 4h ago`, the funnel measures the median hours to first contact, and the
-- lead timeline wants a dated row for each - none of which a boolean can
-- answer. Facts are timestamps, so the three become contacted_at,
-- responded_at and converted_at, and lead_stage derives from those.
--
-- THE BOOLEANS STAY, and they stay LIVE. The wave says keep them until the
-- backfill is verified and drop them in a later wave, so nothing here is
-- allowed to let the two halves drift apart: a stale boolean beside a live
-- timestamp is a second answer to the same question. public.lead_stage_stamp()
-- keeps the pair in step from whichever side is written - the flag going true
-- stamps the moment, the moment arriving raises the flag, either one being
-- cleared clears the other. One DROP TRIGGER plus one DROP COLUMN retires the
-- boolean half later, with no code change in between.
--
-- WHAT THE BACKFILL DATES ARE, AND WHAT THEY ARE NOT. The moment a stage was
-- reached is recorded NOWHERE, so these are the nearest EVIDENCE, named here
-- so nobody later reads them as a recorded fact:
--
--   contacted_at  the FIRST OUTBOUND text, call or email to the lead's own
--                 number or address - a real event. Fallback: last_contacted,
--                 then updated_at. (last_contacted is only a fallback because
--                 db/leads/sql/create.sql stamps it NOW() at creation, so for
--                 a lead nobody has contacted it is the creation time.)
--   responded_at  the FIRST INBOUND text or call from the lead's own number -
--                 also a real event. No inbound email is recorded anywhere
--                 (media.emails holds sends only), so an email reply has no
--                 evidence. Fallback: updated_at.
--   converted_at  updated_at. crm/leads' convert() flips the boolean as its
--                 last write, so the row's own last-updated moment is the
--                 closest thing that exists. There is no customer-side link
--                 column to read instead (api/src/domains/crm/leads/service.ts
--                 writes neither direction), so this one is the weakest of the
--                 three and the NOTICE below counts it separately.
--
-- A row whose boolean is false gets a NULL moment, which is the same fact
-- stated once instead of twice.
--
-- Purely additive: three columns, one trigger, one index. `exchange` is
-- neither read nor written.

ALTER TABLE leads.leads
  ADD COLUMN IF NOT EXISTS contacted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS responded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS converted_at timestamp with time zone;

-- migration_leads_status_idx covers (converted, contacted, responded); the
-- derivation moves to the three moments, so the access path moves with it.
CREATE INDEX IF NOT EXISTS leads_stage_moments
  ON leads.leads (converted_at, contacted_at, responded_at);

WITH evidence AS (
  SELECT l.id,
         nullif(right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10), '') AS digits,
         nullif(lower(trim(coalesce(l.email, ''))), '') AS email_key
    FROM leads.leads l
),
touched AS (
  SELECT e.id,
         least(t.first_out, c.first_out, m.first_out) AS first_out,
         least(t.first_in, c.first_in) AS first_in
    FROM evidence e
    LEFT JOIN LATERAL (
      SELECT min(s.created_at) FILTER (WHERE s.direction = 'outbound') AS first_out,
             min(s.created_at) FILTER (WHERE s.direction = 'inbound') AS first_in
        FROM crm.sms_messages s
       WHERE e.digits IS NOT NULL
         AND (right(regexp_replace(s.from_number, '\D', '', 'g'), 10) = e.digits
           OR right(regexp_replace(s.to_number, '\D', '', 'g'), 10) = e.digits)
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT min(k.started_at) FILTER (WHERE k.direction = 'outbound') AS first_out,
             min(k.started_at) FILTER (WHERE k.direction = 'inbound') AS first_in
        FROM crm.calls k
       WHERE e.digits IS NOT NULL
         AND (right(regexp_replace(k.from_number, '\D', '', 'g'), 10) = e.digits
           OR right(regexp_replace(k.to_number, '\D', '', 'g'), 10) = e.digits)
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT min(em.sent_at) AS first_out
        FROM media.emails em
       WHERE e.email_key IS NOT NULL
         AND lower(trim(em.to_address)) = e.email_key
    ) m ON true
)
UPDATE leads.leads l
   SET contacted_at = CASE WHEN l.contacted
                           THEN coalesce(w.first_out, l.last_contacted, l.updated_at) END,
       responded_at = CASE WHEN l.responded
                           THEN coalesce(w.first_in, l.updated_at) END,
       converted_at = CASE WHEN l.converted THEN l.updated_at END
  FROM touched w
 WHERE w.id = l.id
   AND (l.contacted OR l.responded OR l.converted)
   AND l.contacted_at IS NULL
   AND l.responded_at IS NULL
   AND l.converted_at IS NULL;

CREATE OR REPLACE FUNCTION public.lead_stage_stamp() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pairs  text[][] := ARRAY[
           ARRAY['contacted', 'contacted_at'],
           ARRAY['responded', 'responded_at'],
           ARRAY['converted', 'converted_at']];
  pair   text[];
  flag   text;
  moment text;
  before jsonb := to_jsonb(NEW);
  prior  jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  patch  jsonb := '{}'::jsonb;
  stamp  timestamptz := clock_timestamp();
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    flag := pair[1];
    moment := pair[2];
    IF prior IS NULL THEN
      IF (before->>moment) IS NOT NULL THEN
        patch := patch || jsonb_build_object(flag, true);
      ELSIF (before->>flag)::boolean THEN
        patch := patch || jsonb_build_object(moment, stamp);
      END IF;
    ELSIF (before->>moment) IS DISTINCT FROM (prior->>moment) THEN
      patch := patch || jsonb_build_object(flag, (before->>moment) IS NOT NULL);
    ELSIF (before->>flag)::boolean IS DISTINCT FROM (prior->>flag)::boolean THEN
      patch := patch || jsonb_build_object(
        moment, CASE WHEN (before->>flag)::boolean THEN stamp END);
    END IF;
  END LOOP;

  IF patch = '{}'::jsonb THEN RETURN NEW; END IF;
  RETURN jsonb_populate_record(NEW, patch);
END
$$;

CREATE OR REPLACE TRIGGER lead_stage_stamp BEFORE INSERT OR UPDATE ON leads.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_stage_stamp();

DO $$
DECLARE
  contacted_rows int;
  contacted_evidence int;
  responded_rows int;
  responded_evidence int;
  converted_rows int;
  drifted int;
BEGIN
  SELECT count(*) FILTER (WHERE contacted),
         count(*) FILTER (WHERE contacted
                            AND contacted_at IS DISTINCT FROM coalesce(last_contacted, updated_at)),
         count(*) FILTER (WHERE responded),
         count(*) FILTER (WHERE responded AND responded_at <> updated_at),
         count(*) FILTER (WHERE converted),
         count(*) FILTER (WHERE contacted <> (contacted_at IS NOT NULL)
                             OR responded <> (responded_at IS NOT NULL)
                             OR converted <> (converted_at IS NOT NULL))
    INTO contacted_rows, contacted_evidence, responded_rows, responded_evidence,
         converted_rows, drifted
    FROM leads.leads;

  RAISE NOTICE 'contacted: % row(s), % dated from a real outbound message', contacted_rows, contacted_evidence;
  RAISE NOTICE 'responded: % row(s), % dated from a real inbound message', responded_rows, responded_evidence;
  RAISE NOTICE 'converted: % row(s), all dated from the row updated_at - the weakest of the three', converted_rows;

  IF drifted > 0 THEN
    RAISE EXCEPTION 'the boolean and the moment disagree on % row(s); the backfill is wrong', drifted;
  END IF;
  RAISE NOTICE 'every row agrees with itself: the boolean is set exactly where the moment is';
END $$;
