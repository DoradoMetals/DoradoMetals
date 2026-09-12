-- A lead gets the same assignment column customers and orders carry
-- (assigned_to_id -> auth.users, ON DELETE SET NULL), and a first-class
-- source field. `contact` (DEFAULT 'Jacob Johnson') was doing the assignment
-- job informally in free text; it is left exactly as it is, untouched history
-- for existing rows. Additive; exchange is neither read nor written.

ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS assigned_to_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_assigned_fk'
  ) THEN
    ALTER TABLE leads.leads ADD CONSTRAINT leads_assigned_fk
      FOREIGN KEY (assigned_to_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_assigned ON leads.leads (assigned_to_id);

ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS source text;
