-- Ruling 97: the payment rails. The payout and charge state machines become
-- ROWS, not columns of a mind.
--
-- The Payment card (design notes section 3) shows one state per order side:
-- a payout runs Not sent -> Processing -> Sent, a charge runs Due ->
-- Processing -> Received, and either can end Failed with a reason. Nothing in
-- the database recorded that: `payments.intents` is Stripe's card intent and
-- nothing else, so a bank payout existed only as a `payments.details` row and
-- an admin's memory of whether they had sent it.
--
-- `payments.transfers` is one row per money movement we initiate or expect,
-- and its `state` column IS the card. `payments.transfer_events` is one row
-- per provider event, unique on (provider, event_id), which is what makes a
-- webhook replay a no-op and an out-of-order delivery harmless: the event is
-- always recorded, and the state only moves forward.
--
-- Ruling 74 is intact - there is no payouts table here. The account a payout
-- goes to is still `payments.details` (sealed) or a Moov vault reference
-- (152); this table holds the MOVEMENT, which nothing held before.
--
-- ADDITIVE ONLY: two enums, two new tables in the `payments` schema, no
-- existing table altered, no row rewritten, `exchange` neither read nor
-- written.
--
-- ROLLBACK: DROP TABLE payments.transfer_events; DROP TABLE payments.transfers;
-- DROP TYPE payments.transfer_state, payments.transfer_kind, payments.rail.
-- Nothing else references them until this branch's code ships.

DO $$ BEGIN
  CREATE TYPE payments.transfer_kind AS ENUM ('payout', 'charge');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payments.rail AS ENUM
    ('ACH', 'ACH_SAME_DAY', 'RTP', 'FEDNOW', 'CARD', 'WIRE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The labels the Payment card renders, spelled the way it renders them, so the
-- view needs no translation table (ruling 71: the decision is added once).
DO $$ BEGIN
  CREATE TYPE payments.transfer_state AS ENUM
    ('Not sent', 'Due', 'Processing', 'Sent', 'Received', 'Failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payments.transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  kind payments.transfer_kind NOT NULL,
  rail payments.rail NOT NULL,
  state payments.transfer_state NOT NULL,
  amount numeric(16,2) NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  counterparty_user_id uuid,
  details_id uuid,
  bank_link_id uuid,
  provider text,
  provider_ref text,
  reference text,
  failure_reason text,
  idempotency_key text,
  sent_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_order_fk
    FOREIGN KEY (order_id) REFERENCES orders.orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_details_fk
    FOREIGN KEY (details_id) REFERENCES payments.details(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_counterparty_fk
    FOREIGN KEY (counterparty_user_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_created_by_id_fkey
    FOREIGN KEY (created_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfers ADD CONSTRAINT transfers_updated_by_id_fkey
    FOREIGN KEY (updated_by_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A payout is never sent twice and a charge is never requested twice: at most
-- one live movement per order per side. A failed one is kept and a fresh
-- attempt is a new row, which is why the index excludes 'Failed'.
CREATE UNIQUE INDEX IF NOT EXISTS transfers_one_live_per_order_kind
  ON payments.transfers (order_id, kind) WHERE state <> 'Failed';

CREATE UNIQUE INDEX IF NOT EXISTS transfers_provider_ref_key
  ON payments.transfers (provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS transfers_order_idx ON payments.transfers (order_id);
CREATE INDEX IF NOT EXISTS transfers_state_idx ON payments.transfers (state, created_at DESC);
CREATE INDEX IF NOT EXISTS transfers_counterparty_idx
  ON payments.transfers (counterparty_user_id);

CREATE TABLE IF NOT EXISTS payments.transfer_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_id uuid,
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  provider_ref text,
  reported_state payments.transfer_state,
  failure_reason text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  applied boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE payments.transfer_events ADD CONSTRAINT transfer_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE payments.transfer_events ADD CONSTRAINT transfer_events_transfer_fk
    FOREIGN KEY (transfer_id) REFERENCES payments.transfers(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The whole of idempotency. An INSERT ... ON CONFLICT DO NOTHING that returns
-- no row IS the answer "this event has already been applied".
CREATE UNIQUE INDEX IF NOT EXISTS transfer_events_provider_event_key
  ON payments.transfer_events (provider, event_id);

CREATE INDEX IF NOT EXISTS transfer_events_transfer_idx
  ON payments.transfer_events (transfer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transfer_events_provider_ref_idx
  ON payments.transfer_events (provider_ref);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.transfers
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
