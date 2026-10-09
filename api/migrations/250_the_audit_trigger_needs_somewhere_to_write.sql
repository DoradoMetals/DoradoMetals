-- TWO TABLES CARRY THE AUDIT TRIGGER AND HAVE NOWHERE FOR IT TO WRITE.
--
-- Migration 116 attached public.audit_stamp() to payments.ledger (116:210)
-- and media.pdfs (116:196). The function asks pg_attribute which of the six
-- audit columns the table actually has and patches only those, so a table
-- with none of them is a silent no-op: the trigger fires on every INSERT,
-- finds no created_by_id and no updated_by_id, and records nobody.
--
-- The cost is not theoretical. payments.ledger is the credit ledger - real
-- money moving in and out of a customer's balance - and the actor on every
-- movement since 116 is lost. media.pdfs holds the documents an employee
-- uploads, and "who uploaded this" is lost the same way.
--
-- NOTHING IS BACKFILLED. The past is genuinely unknown: no column, no text
-- sibling and no second copy anywhere records who wrote those rows, so every
-- existing row keeps a NULL actor. A guessed actor on a money row would be
-- worse than an absent one.
--
-- media.pdfs has no updated_at and never gets one here: the table is
-- append-only (documents/pdfs/store.ts writes, nothing updates), and
-- audit_stamp() patches only the columns a table has. updated_by_id is added
-- anyway because the trigger fills it on the day an UPDATE path appears, and
-- a column that exists costs nothing while a missing one loses the fact.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TABLE payments.ledger
  ADD COLUMN IF NOT EXISTS created_by_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_id uuid;

ALTER TABLE media.pdfs
  ADD COLUMN IF NOT EXISTS created_by_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ledger_created_by_id_fkey' AND conrelid = 'payments.ledger'::regclass
  ) THEN
    ALTER TABLE payments.ledger ADD CONSTRAINT ledger_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ledger_updated_by_id_fkey' AND conrelid = 'payments.ledger'::regclass
  ) THEN
    ALTER TABLE payments.ledger ADD CONSTRAINT ledger_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pdfs_created_by_id_fkey' AND conrelid = 'media.pdfs'::regclass
  ) THEN
    ALTER TABLE media.pdfs ADD CONSTRAINT pdfs_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pdfs_updated_by_id_fkey' AND conrelid = 'media.pdfs'::regclass
  ) THEN
    ALTER TABLE media.pdfs ADD CONSTRAINT pdfs_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

-- The activity feed reads the ledger by actor, so the actor is an access path.
CREATE INDEX IF NOT EXISTS ledger_created_by ON payments.ledger (created_by_id);
CREATE INDEX IF NOT EXISTS pdfs_created_by ON media.pdfs (created_by_id);

DO $$
DECLARE
  ledger_rows int;
  pdf_rows    int;
BEGIN
  SELECT count(*) INTO ledger_rows FROM payments.ledger;
  SELECT count(*) INTO pdf_rows FROM media.pdfs;
  RAISE NOTICE 'payments.ledger holds % row(s) and media.pdfs holds % row(s); every one keeps a NULL actor, which is the truth about them',
    ledger_rows, pdf_rows;
END $$;
