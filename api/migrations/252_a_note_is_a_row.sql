-- NOTES BECOME ROWS, AND ONE TABLE SERVES BOTH CUSTOMERS AND LEADS.
--
-- Jacob's ruling: notes-as-rows, one crm.notes for both sides. Today a
-- customer's notes are one free-text column (auth.users.notes, migration 207)
-- and a lead's are another (leads.leads.notes, genesis) - so a note has no
-- author and no date, the Notes card cannot draw `Jacob · Sep 4, 2026`, and
-- the customer timeline's note row is one synthetic entry dated by
-- auth.users."updatedAt" (db/crm/timeline/sql/for_customer.sql): a ban, an
-- assignment or a credit adjustment all silently redate the note.
--
-- Exactly one of user_id / lead_id is set, which is what lets a lead's notes
-- survive conversion by RE-POINTING them at the new customer - the thing the
-- Convert dialog already promises and crm/leads' convert() did not do.
--
-- THE TWO FREE-TEXT COLUMNS STAY. Each is backfilled as ONE row and neither
-- is dropped here; the drop is a later wave and only after the counts below
-- are verified against production. The backfilled row carries:
--   created_at      the subject row's own last-updated moment - the only date
--                   that exists for a note nobody dated. Supplied explicitly
--                   because public.audit_stamp() COALESCEs a given created_at
--                   rather than overwriting it (migration 116).
--   created_by_id   NULL. No author was ever recorded for either column, and
--                   a guessed one would be worse than an absent one.
--
-- Purely additive: one new table in a schema that already exists. `exchange`
-- is neither read nor written.

CREATE TABLE IF NOT EXISTS crm.notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  lead_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_pkey'
                   AND conrelid = 'crm.notes'::regclass) THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_one_subject') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_one_subject
      CHECK ((user_id IS NULL) <> (lead_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_body_is_written') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_body_is_written
      CHECK (btrim(body) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_fk') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_lead_fk') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_lead_fk
      FOREIGN KEY (lead_id) REFERENCES leads.leads (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_created_by_id_fkey') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_updated_by_id_fkey') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notes_user ON crm.notes (user_id, created_at);
CREATE INDEX IF NOT EXISTS notes_lead ON crm.notes (lead_id, created_at);
CREATE INDEX IF NOT EXISTS notes_created_by ON crm.notes (created_by_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO crm.notes (user_id, body, created_at, updated_at)
SELECT u.id, u.notes, u."updatedAt", u."updatedAt"
  FROM auth.users u
 WHERE u.notes IS NOT NULL
   AND btrim(u.notes) <> ''
   AND NOT EXISTS (SELECT 1 FROM crm.notes n WHERE n.user_id = u.id);

INSERT INTO crm.notes (lead_id, body, created_at, updated_at)
SELECT l.id, l.notes, l.updated_at, l.updated_at
  FROM leads.leads l
 WHERE l.notes IS NOT NULL
   AND btrim(l.notes) <> ''
   AND NOT EXISTS (SELECT 1 FROM crm.notes n WHERE n.lead_id = l.id);

DO $$
DECLARE
  customer_columns int;
  customer_rows    int;
  lead_columns     int;
  lead_rows        int;
BEGIN
  SELECT count(*) INTO customer_columns FROM auth.users
   WHERE notes IS NOT NULL AND btrim(notes) <> '';
  SELECT count(*) INTO lead_columns FROM leads.leads
   WHERE notes IS NOT NULL AND btrim(notes) <> '';
  SELECT count(*) FILTER (WHERE user_id IS NOT NULL),
         count(*) FILTER (WHERE lead_id IS NOT NULL)
    INTO customer_rows, lead_rows
    FROM crm.notes;

  RAISE NOTICE 'auth.users.notes: % written column(s) -> % customer note row(s)',
    customer_columns, customer_rows;
  RAISE NOTICE 'leads.leads.notes: % written column(s) -> % lead note row(s)',
    lead_columns, lead_rows;

  IF customer_rows < customer_columns OR lead_rows < lead_columns THEN
    RAISE EXCEPTION 'a written notes column has no row; the backfill lost one';
  END IF;
END $$;
