-- Ruling 97, the bank-linking half. A linked bank account is a REFERENCE to
-- somebody else's vault and never a number of ours.
--
-- A customer links through Plaid Link (public token -> processor token ->
-- Moov bank account) or through Moov's own micro-deposits; a refiner links
-- through a Moov vendor form and never touches our API at all. What we keep in
-- every case is the same: the Moov account id, the Moov payment-method id we
-- name as a transfer source or destination, and the last four for the operator
-- to read. No routing number, no account number, encrypted or otherwise -
-- `payments.details` already holds the legacy sealed envelopes and this table
-- deliberately does not repeat them.
--
-- `payments.transfers.bank_link_id` (150) points here; the foreign key is
-- added now that the table exists.
--
-- ADDITIVE ONLY: two enums, one new `payments` table, one new foreign key on a
-- column added by 150 and never yet written. `exchange` untouched.
--
-- ROLLBACK: ALTER TABLE payments.transfers DROP CONSTRAINT transfers_bank_link_fk;
-- DROP TABLE payments.bank_links; DROP TYPE payments.link_method, payments.link_status.

DO $$ BEGIN
  CREATE TYPE payments.link_status AS ENUM ('pending', 'verified', 'errored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payments.link_method AS ENUM ('plaid', 'micro_deposits', 'vendor_form');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payments.bank_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  provider text DEFAULT 'moov'::text NOT NULL,
  moov_account_id text NOT NULL,
  moov_bank_account_id text,
  payment_method_id text,
  rail payments.rail,
  holder_name text,
  bank_name text,
  last_four text,
  status payments.link_status DEFAULT 'pending'::payments.link_status NOT NULL,
  linked_by payments.link_method NOT NULL,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_created_by_id_fkey
    FOREIGN KEY (created_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.bank_links ADD CONSTRAINT bank_links_updated_by_id_fkey
    FOREIGN KEY (updated_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_bank_link_fk
    FOREIGN KEY (bank_link_id) REFERENCES payments.bank_links(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bank_links_payment_method_key
  ON payments.bank_links (provider, payment_method_id) WHERE payment_method_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_links_user_idx ON payments.bank_links (user_id, status);
CREATE INDEX IF NOT EXISTS bank_links_moov_account_idx
  ON payments.bank_links (moov_account_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.bank_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
