-- WHERE A LEAD CAME FROM, AND HOW IT WANTS TO BE REACHED - BOTH AS ROWS.
--
-- Ruling 116. Two lookups, seeded here:
--   leads.sources              sell_form | trade_referral | customer_referral
--                              | self_created | walk_in
--   leads.contact_preferences  text | call | email
-- and two pointers on leads.leads: source_id and contact_preference_id.
--
-- THE FREE-TEXT COLUMNS STAY. `source` (migration 208) and `contact` are not
-- dropped here; the drop is a later wave, and only after the data is verified.
-- What the verification already found, read through
-- PROD_READONLY_DATABASE_URL, counts only:
--
--   * `exchange.leads` HAS NO `source` COLUMN. 208 added `leads.leads.source`
--     as a brand-new field and nothing has ever written it, so after the
--     genesis backfill `source` is 100% NULL on production. There is nothing
--     to map and source_id stays NULL for every carried-over lead.
--   * `exchange.leads.contact` is populated on all 251 rows with 2 distinct
--     values, and neither matches a contact-preference word. It holds an
--     EMPLOYEE NAME - which is what 208 said it was doing informally, the
--     assignment job. So `contact` maps to `assigned_to_id`, NOT to
--     contact_preference_id, and the later wave should route it there rather
--     than to this column.
--
-- The backfill below is still written and still runs: it maps every
-- recognisable value in either column and RAISE NOTICEs how many rows it
-- could not place, so production day gets a number rather than an assumption.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS leads.sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS leads.contact_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_sources_pkey') THEN
    ALTER TABLE leads.sources ADD CONSTRAINT lead_sources_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_preferences_pkey') THEN
    ALTER TABLE leads.contact_preferences
      ADD CONSTRAINT contact_preferences_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS lead_sources_key ON leads.sources (key);
CREATE UNIQUE INDEX IF NOT EXISTS contact_preferences_key ON leads.contact_preferences (key);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.contact_preferences
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO leads.sources (key, label, sort_order)
SELECT v.key, v.label, v.sort_order
  FROM (VALUES
    ('sell_form',         'Sell form',         1),
    ('trade_referral',    'Trade referral',    2),
    ('customer_referral', 'Customer referral', 3),
    ('self_created',      'Self created',      4),
    ('walk_in',           'Walk-in',           5)
  ) AS v(key, label, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM leads.sources s WHERE s.key = v.key);

INSERT INTO leads.contact_preferences (key, label, sort_order)
SELECT v.key, v.label, v.sort_order
  FROM (VALUES
    ('text',  'Text',  1),
    ('call',  'Call',  2),
    ('email', 'Email', 3)
  ) AS v(key, label, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM leads.contact_preferences p WHERE p.key = v.key);

ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS contact_preference_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_fk') THEN
    ALTER TABLE leads.leads ADD CONSTRAINT leads_source_fk
      FOREIGN KEY (source_id) REFERENCES leads.sources (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_contact_preference_fk') THEN
    ALTER TABLE leads.leads ADD CONSTRAINT leads_contact_preference_fk
      FOREIGN KEY (contact_preference_id) REFERENCES leads.contact_preferences (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_source_id ON leads.leads (source_id);
CREATE INDEX IF NOT EXISTS leads_contact_preference_id ON leads.leads (contact_preference_id);

-- The backfill. audit_stamp is suspended for it: rewriting updated_at and
-- updated_by_id on 251 leads would say an employee edited every lead today,
-- which is false. The trigger is restored immediately after.
ALTER TABLE leads.leads DISABLE TRIGGER audit_stamp;

UPDATE leads.leads l
   SET source_id = s.id
  FROM leads.sources s
 WHERE l.source_id IS NULL
   AND l.source IS NOT NULL
   AND (
     lower(regexp_replace(trim(l.source), '[^a-z0-9]+', '_', 'gi')) = s.key
     OR (s.key = 'sell_form'         AND lower(l.source) ~ '(sell.?form|web.?form|website|online)')
     OR (s.key = 'trade_referral'    AND lower(l.source) ~ '(trade|dealer|jeweler|pawn)')
     OR (s.key = 'customer_referral' AND lower(l.source) ~ '(customer.?referral|word.?of.?mouth|friend)')
     OR (s.key = 'self_created'      AND lower(l.source) ~ '(self|manual|admin|internal)')
     OR (s.key = 'walk_in'           AND lower(l.source) ~ '(walk.?in|in.?store|counter)')
   );

UPDATE leads.leads l
   SET contact_preference_id = p.id
  FROM leads.contact_preferences p
 WHERE l.contact_preference_id IS NULL
   AND l.contact IS NOT NULL
   AND (
     lower(trim(l.contact)) = p.key
     OR (p.key = 'text'  AND lower(l.contact) ~ '(text|sms|message)')
     OR (p.key = 'call'  AND lower(l.contact) ~ '(call|phone|ring)')
     OR (p.key = 'email' AND lower(l.contact) ~ 'e-?mail')
   );

ALTER TABLE leads.leads ENABLE TRIGGER audit_stamp;

DO $$
DECLARE
  total            bigint;
  source_present   bigint;
  source_mapped    bigint;
  contact_present  bigint;
  contact_mapped   bigint;
BEGIN
  SELECT count(*),
         count(source), count(source_id),
         count(contact), count(contact_preference_id)
    INTO total, source_present, source_mapped, contact_present, contact_mapped
    FROM leads.leads;
  RAISE NOTICE 'leads.leads: % row(s) total', total;
  RAISE NOTICE '  source:  % populated, % mapped to source_id, % UNMAPPED',
    source_present, source_mapped, source_present - source_mapped;
  RAISE NOTICE '  contact: % populated, % mapped to contact_preference_id, % UNMAPPED',
    contact_present, contact_mapped, contact_present - contact_mapped;
  RAISE NOTICE '  neither free-text column is dropped here - verify the unmapped counts first';
END $$;
