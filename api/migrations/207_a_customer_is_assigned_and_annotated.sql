-- A customer gets the same assignment column orders.orders and
-- refining.orders already carry (assigned_to_id -> auth.users, ON DELETE SET
-- NULL), and a free-text notes field matching leads.leads.notes' own shape.
-- Additive; exchange is neither read nor written.

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS assigned_to_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_assigned_fk'
  ) THEN
    ALTER TABLE auth.users ADD CONSTRAINT users_assigned_fk
      FOREIGN KEY (assigned_to_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_assigned ON auth.users (assigned_to_id);

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS notes text;
