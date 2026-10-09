-- CONSENT BECOMES A ROW PER DECISION, BECAUSE AN OPT-OUT CANNOT BE PROVED
-- FROM A NULLED COLUMN.
--
-- auth.users.sms_consent_at / sms_consent_method (229) and the same pair on
-- leads.leads (230) hold CURRENT STATE ONLY. A STOP keyword nulls the
-- timestamp (db/auth/users/sql/clear_sms_consent.sql,
-- db/leads/sql/clear_sms_consent.sql) and leaves no record that a STOP ever
-- arrived - so the one question a carrier or a TCPA complaint asks, WHEN DID
-- THEY OPT OUT, has no answer anywhere in the schema. crm.sms_consent_events
-- is that answer: append-only, one row per decision, in either direction.
--
-- THE CURRENT-STATE COLUMNS STAY AND STAY LIVE. They are the fast read every
-- existing view already uses; this table is the record underneath them.
-- Nothing derives one from the other, because the columns can be reached by
-- paths that predate this table and the events are the audit trail, not a
-- cache.
--
-- THE KIND IS A ROW (ruling 116): crm.sms_consent_kinds, opt_in | opt_out,
-- seeded here, so the label a screen draws comes from the row and the write
-- resolves the id by key in SQL rather than through a TypeScript map.
--
-- THE METHOD KEEPS THE VOCABULARY 229/230/231 ALREADY ESTABLISHED -
-- web_form | verbal | via_text - as the same CHECK rather than a fourth
-- lookup, so the column on the event and the column on the subject can never
-- mean different things. It is nullable: an admin clearing consent on the
-- PATCH records a real opt-out through no particular channel, and inventing
-- one would be worse than leaving it absent.
--
-- WHAT IS BACKFILLED, AND WHAT CANNOT BE. Every subject with consent on file
-- gets one opt_in row at its own recorded sms_consent_at - a real moment,
-- unlike the notes and assignment backfills. Past OPT-OUTS cannot be
-- recovered at all: the only column that held them was overwritten with NULL,
-- which is the whole reason this table exists.
--
-- Purely additive: two new tables in a schema that already exists.
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS crm.sms_consent_kinds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS crm.sms_consent_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  lead_id uuid,
  kind_id uuid NOT NULL,
  method text,
  at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_consent_kinds_pkey') THEN
    ALTER TABLE crm.sms_consent_kinds ADD CONSTRAINT sms_consent_kinds_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_consent_events_pkey') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_consent_events_one_subject') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_one_subject
      CHECK ((user_id IS NULL) <> (lead_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'sms_consent_events_method_is_known') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_method_is_known
      CHECK (method IS NULL OR method IN ('web_form', 'verbal', 'via_text'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_consent_events_user_fk') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_consent_events_lead_fk') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_lead_fk
      FOREIGN KEY (lead_id) REFERENCES leads.leads (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_consent_events_kind_fk') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_kind_fk
      FOREIGN KEY (kind_id) REFERENCES crm.sms_consent_kinds (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'sms_consent_events_created_by_id_fkey') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'sms_consent_events_updated_by_id_fkey') THEN
    ALTER TABLE crm.sms_consent_events ADD CONSTRAINT sms_consent_events_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sms_consent_kinds_key ON crm.sms_consent_kinds (key);
CREATE INDEX IF NOT EXISTS sms_consent_events_user ON crm.sms_consent_events (user_id, at);
CREATE INDEX IF NOT EXISTS sms_consent_events_lead ON crm.sms_consent_events (lead_id, at);
CREATE INDEX IF NOT EXISTS sms_consent_events_kind ON crm.sms_consent_events (kind_id);
CREATE INDEX IF NOT EXISTS sms_consent_events_created_by
  ON crm.sms_consent_events (created_by_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.sms_consent_kinds
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.sms_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO crm.sms_consent_kinds (key, label, sort_order)
SELECT v.key, v.label, v.sort_order
  FROM (VALUES
    ('opt_in',  'Opted in',  1),
    ('opt_out', 'Opted out', 2)
  ) AS v(key, label, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM crm.sms_consent_kinds k WHERE k.key = v.key);

INSERT INTO crm.sms_consent_events (user_id, kind_id, method, at, created_at, updated_at)
SELECT u.id, k.id, u.sms_consent_method, u.sms_consent_at, u.sms_consent_at, u.sms_consent_at
  FROM auth.users u
  JOIN crm.sms_consent_kinds k ON k.key = 'opt_in'
 WHERE u.sms_consent_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM crm.sms_consent_events e
      WHERE e.user_id = u.id AND e.kind_id = k.id AND e.at = u.sms_consent_at
   );

INSERT INTO crm.sms_consent_events (lead_id, kind_id, method, at, created_at, updated_at)
SELECT l.id, k.id, l.sms_consent_method, l.sms_consent_at, l.sms_consent_at, l.sms_consent_at
  FROM leads.leads l
  JOIN crm.sms_consent_kinds k ON k.key = 'opt_in'
 WHERE l.sms_consent_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM crm.sms_consent_events e
      WHERE e.lead_id = l.id AND e.kind_id = k.id AND e.at = l.sms_consent_at
   );

DO $$
DECLARE
  consented_customers int;
  consented_leads     int;
  customer_events     int;
  lead_events         int;
BEGIN
  SELECT count(*) INTO consented_customers FROM auth.users WHERE sms_consent_at IS NOT NULL;
  SELECT count(*) INTO consented_leads FROM leads.leads WHERE sms_consent_at IS NOT NULL;
  SELECT count(*) FILTER (WHERE user_id IS NOT NULL),
         count(*) FILTER (WHERE lead_id IS NOT NULL)
    INTO customer_events, lead_events
    FROM crm.sms_consent_events;

  RAISE NOTICE '% consented customer(s) -> % event row(s)', consented_customers, customer_events;
  RAISE NOTICE '% consented lead(s) -> % event row(s)', consented_leads, lead_events;
  RAISE NOTICE 'no past opt-out is recoverable: the column that held it was overwritten with NULL';

  IF customer_events < consented_customers OR lead_events < consented_leads THEN
    RAISE EXCEPTION 'a consented subject has no event row; the backfill lost one';
  END IF;
END $$;
