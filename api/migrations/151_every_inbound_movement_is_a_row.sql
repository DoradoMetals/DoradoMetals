-- Ruling 97, the matching half: every inbound movement we learn of becomes a
-- row, unmatched until somebody or something matches it.
--
-- The design notes' ladder (section 6) is four rungs: a virtual account number
-- per order is exact and we do not have one yet; a `SO-####` reference in the
-- memo is a strong hint; amount +/- $0.50 with a counterparty and a memo is a
-- PRE-SELECTION that never auto-confirms; and manual pick is the floor that
-- always works. Every rung reads the same table, which is this one. The
-- virtual-account rung gets a column (`account_ref`) and no code: when Moov or
-- a bank hands us per-order account numbers, the exact match is a WHERE on it.
--
-- `payments.feed_cursors` is the one row Plaid's Transactions sync needs to be
-- resumable. Without it every sync starts from the beginning of the account.
--
-- ADDITIVE ONLY: two enums, two new `payments` tables, nothing altered,
-- nothing rewritten, `exchange` neither read nor written.
--
-- ROLLBACK: DROP TABLE payments.feed_cursors, payments.inbound_transactions;
-- DROP TYPE payments.match_state, payments.inbound_source.

DO $$ BEGIN
  CREATE TYPE payments.inbound_source AS ENUM ('moov', 'plaid', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payments.match_state AS ENUM ('Unmatched', 'Matched', 'Ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payments.inbound_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source payments.inbound_source NOT NULL,
  external_id text,
  amount numeric(16,2) NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  counterparty_name text,
  memo text,
  account_ref text,
  state payments.match_state DEFAULT 'Unmatched'::payments.match_state NOT NULL,
  order_id uuid,
  transfer_id uuid,
  matched_at timestamp with time zone,
  matched_by_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  ALTER TABLE payments.inbound_transactions ADD CONSTRAINT inbound_transactions_pkey
    PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.inbound_transactions ADD CONSTRAINT inbound_transactions_order_fk
    FOREIGN KEY (order_id) REFERENCES orders.orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.inbound_transactions ADD CONSTRAINT inbound_transactions_transfer_fk
    FOREIGN KEY (transfer_id) REFERENCES payments.transfers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.inbound_transactions ADD CONSTRAINT inbound_transactions_matched_by_fkey
    FOREIGN KEY (matched_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.inbound_transactions ADD CONSTRAINT inbound_transactions_created_by_id_fkey
    FOREIGN KEY (created_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.inbound_transactions ADD CONSTRAINT inbound_transactions_updated_by_id_fkey
    FOREIGN KEY (updated_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per movement the feed reports, however many times it reports it.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_transactions_source_external_key
  ON payments.inbound_transactions (source, external_id) WHERE external_id IS NOT NULL;

-- The unmatched list and the candidate pre-selection both open with
-- `state = 'Unmatched'`, so the index leads with it.
CREATE INDEX IF NOT EXISTS inbound_transactions_state_idx
  ON payments.inbound_transactions (state, occurred_at DESC);
CREATE INDEX IF NOT EXISTS inbound_transactions_order_idx
  ON payments.inbound_transactions (order_id);
CREATE INDEX IF NOT EXISTS inbound_transactions_transfer_idx
  ON payments.inbound_transactions (transfer_id);

CREATE TABLE IF NOT EXISTS payments.feed_cursors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source text NOT NULL,
  cursor text,
  synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE payments.feed_cursors ADD CONSTRAINT feed_cursors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS feed_cursors_source_key
  ON payments.feed_cursors (source);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.inbound_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
