-- WHO OWNED THIS PERSON BEFORE, AND WHEN DID IT MOVE.
--
-- auth.users.assigned_to_id (migration 207) and leads.leads.assigned_to_id
-- (migration 208) hold the CURRENT owner and overwrite the previous one, so a
-- reassignment leaves no trace: the audit columns record the latest writer,
-- never the value that was replaced. crm.assignments is the append-only
-- record, written on every assign and reassign; the two columns stay exactly
-- as they are and remain the derived "current".
--
-- assigned_to_id IS NULLABLE ON PURPOSE. Taking a lead off an employee is as
-- much a fact as giving it to one, and a row with a NULL assignee is how
-- "unassigned at this moment, by this person" is recorded. A history that
-- only knows additions cannot answer who dropped it.
--
-- assigned_at is the BUSINESS moment and created_at is when the row was
-- written. They are the same for every live write and differ only for the
-- backfill below, which is exactly why both exist.
--
-- THE BACKFILL DATES ARE EVIDENCE, NOT A RECORD. Nothing anywhere recorded
-- when the current owner took over, so each carried-over row takes the
-- subject's own last-updated moment and the NOTICE counts them, so production
-- day reads a number rather than an assumption. The actor is NULL: no author
-- was ever recorded for an assignment either.
--
-- Purely additive: one new table in a schema that already exists. `exchange`
-- is neither read nor written.

CREATE TABLE IF NOT EXISTS crm.assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  lead_id uuid,
  assigned_to_id uuid,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_pkey'
                   AND conrelid = 'crm.assignments'::regclass) THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_one_subject') THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_one_subject
      CHECK ((user_id IS NULL) <> (lead_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_user_fk') THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_lead_fk') THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_lead_fk
      FOREIGN KEY (lead_id) REFERENCES leads.leads (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_assignee_fk') THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_assignee_fk
      FOREIGN KEY (assigned_to_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_created_by_id_fkey') THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_updated_by_id_fkey') THEN
    ALTER TABLE crm.assignments ADD CONSTRAINT assignments_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assignments_user ON crm.assignments (user_id, assigned_at);
CREATE INDEX IF NOT EXISTS assignments_lead ON crm.assignments (lead_id, assigned_at);
CREATE INDEX IF NOT EXISTS assignments_assignee ON crm.assignments (assigned_to_id);
CREATE INDEX IF NOT EXISTS assignments_created_by ON crm.assignments (created_by_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO crm.assignments (user_id, assigned_to_id, assigned_at, created_at, updated_at)
SELECT u.id, u.assigned_to_id, u."updatedAt", u."updatedAt", u."updatedAt"
  FROM auth.users u
 WHERE u.assigned_to_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM crm.assignments a WHERE a.user_id = u.id);

INSERT INTO crm.assignments (lead_id, assigned_to_id, assigned_at, created_at, updated_at)
SELECT l.id, l.assigned_to_id, l.updated_at, l.updated_at, l.updated_at
  FROM leads.leads l
 WHERE l.assigned_to_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM crm.assignments a WHERE a.lead_id = l.id);

DO $$
DECLARE
  owned_customers int;
  owned_leads     int;
  customer_rows   int;
  lead_rows       int;
BEGIN
  SELECT count(*) INTO owned_customers FROM auth.users WHERE assigned_to_id IS NOT NULL;
  SELECT count(*) INTO owned_leads FROM leads.leads WHERE assigned_to_id IS NOT NULL;
  SELECT count(*) FILTER (WHERE user_id IS NOT NULL),
         count(*) FILTER (WHERE lead_id IS NOT NULL)
    INTO customer_rows, lead_rows
    FROM crm.assignments;

  RAISE NOTICE '% owned customer(s) -> % assignment row(s), each dated by the customer row updated_at',
    owned_customers, customer_rows;
  RAISE NOTICE '% owned lead(s) -> % assignment row(s), each dated by the lead row updated_at',
    owned_leads, lead_rows;

  IF customer_rows < owned_customers OR lead_rows < owned_leads THEN
    RAISE EXCEPTION 'an owned subject has no assignment row; the backfill lost one';
  END IF;
END $$;
