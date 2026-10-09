-- THE FUNNEL'S TARGETS ARE ROWS.
--
-- GET /api/leads/funnel measures conversion and time-to-first-contact and
-- draws each against a target. Ruling 116: a target is a business fact Jacob
-- changes, so it is a row with a `key` and a `value`, updated with an UPDATE
-- and never by a deploy.
--
-- The seeded values come from the Leads list drawing, which writes
-- "median 4h to first contact" (docs/design/customers-leads-screens.md §3);
-- conversion_rate starts at 0.25. Both are starting numbers, not findings -
-- that is exactly why they are rows.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS crm.targets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  value numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_targets_pkey') THEN
    ALTER TABLE crm.targets ADD CONSTRAINT crm_targets_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_targets_value_positive') THEN
    ALTER TABLE crm.targets ADD CONSTRAINT crm_targets_value_positive CHECK (value > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_targets_key ON crm.targets (key);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.targets
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO crm.targets (key, label, value)
SELECT v.key, v.label, v.value
  FROM (VALUES
    ('lead_conversion_rate',         'Lead conversion rate',          0.25),
    ('lead_hours_to_first_contact',  'Hours to first contact',        4.0)
  ) AS v(key, label, value)
 WHERE NOT EXISTS (SELECT 1 FROM crm.targets t WHERE t.key = v.key);
