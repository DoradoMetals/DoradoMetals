-- THE TIMELINE'S KINDS ARE ROWS.
--
-- GET /api/leads/:id/timeline merges nine kinds of fact about a lead, and
-- ruling 116 says that set is rows with a `key` and a `label`, not an enum
-- and not a TypeScript union. crm.timeline_kinds is that table; the lead
-- timeline view joins it so the label a screen draws comes from the row.
--
-- The CUSTOMER timeline (crm/timeline/sql/for_customer.sql) keeps the five
-- kinds it already returns against its own contract; this table is the
-- superset and the lead view is what reads it.
--
-- NO leads.notes TABLE IS CREATED, DELIBERATELY. The wave doc says to mirror
-- the customer notes table if notes exist only for customers. They do not
-- exist as a table at all: a customer's notes are one free-text column,
-- auth.users.notes, which for_customer.sql already renders as a single
-- timeline row timestamped by the row's own last update - and a lead already
-- carries the identical column, leads.leads.notes. Adding a row-per-note
-- table on the lead side alone would make the two models diverge, which is
-- the opposite of mirroring. Notes-as-rows is one decision for both sides,
-- and it is Jacob's.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS crm.timeline_kinds (
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timeline_kinds_pkey') THEN
    ALTER TABLE crm.timeline_kinds ADD CONSTRAINT timeline_kinds_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS timeline_kinds_key ON crm.timeline_kinds (key);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.timeline_kinds
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO crm.timeline_kinds (key, label, sort_order)
SELECT v.key, v.label, v.sort_order
  FROM (VALUES
    ('created',       'Created',           1),
    ('assigned',      'Assigned',          2),
    ('call',          'Call',              3),
    ('text',          'Text',              4),
    ('email',         'Email',             5),
    ('note',          'Note',              6),
    ('consent',       'Texting consent',   7),
    ('estimate_item', 'Estimate line',     8),
    ('converted',     'Converted',         9)
  ) AS v(key, label, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM crm.timeline_kinds k WHERE k.key = v.key);
