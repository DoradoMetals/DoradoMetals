-- A SALE CARRIES ITS REFUNDS, ITS PARCEL CLAIMS AND THE REASONS FOR A JUDGED ACTION
-- (rulings 112, 133, 149).
--
-- payments.refunds: one row per refund of money we received. Ruling 149: card
-- refunds through Stripe for now, so `rail` and `provider` name the method and
-- a later wire, ACH or crypto refund is a row with its own rail and provider.
-- The row is written as 'Pending' BEFORE the provider is called and stamped
-- 'Succeeded' (provider_ref, refunded_at) after; the provider call carries the
-- idempotency key `refund_<id>`, so a retry after a crash never refunds twice
-- and the record is never lost. `payment_ref` is the provider reference of the
-- payment refunded (a Stripe payment intent). `details_id` is the instrument
-- the money goes back to, for the card brand and last four on a read.
--
-- shipping.claims: a lost or damaged parcel's claim with the carrier, on the
-- shipment. Opened at/by is the audit stamp; a Pending claim has no
-- resolved_at, a Paid or Denied claim has one.
--
-- orders.action_reasons: the stored reason for an `override` or `confirm`
-- action (ruling 112) that has no row of its own to hold one: an edit to a
-- charged sale, an address change after a label. Who and when is the stamp.
--
-- Purely additive: three new tables. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS payments.refunds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  rail payments.rail NOT NULL,
  provider text NOT NULL,
  payment_ref text,
  details_id uuid,
  amount numeric(16,2) NOT NULL,
  reason text NOT NULL,
  state text DEFAULT 'Pending'::text NOT NULL,
  provider_ref text,
  failure_reason text,
  refunded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS shipping.claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipment_id uuid NOT NULL,
  kind text NOT NULL,
  amount numeric(16,2) NOT NULL,
  carrier_claim_number text,
  status text DEFAULT 'Pending'::text NOT NULL,
  paid_amount numeric(16,2),
  note text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS orders.action_reasons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_pkey') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_order_id_fkey') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_details_id_fkey') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_details_id_fkey
      FOREIGN KEY (details_id) REFERENCES payments.details (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_amount_positive') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_reason_said_something') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_reason_said_something
      CHECK (length(btrim(reason)) >= 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_state_known') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_state_known
      CHECK (state IN ('Pending', 'Succeeded', 'Failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_succeeded_is_stamped') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_succeeded_is_stamped
      CHECK ((state = 'Succeeded') = (refunded_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_created_by_id_fkey') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_updated_by_id_fkey') THEN
    ALTER TABLE payments.refunds ADD CONSTRAINT refunds_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_pkey') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_shipment_id_fkey') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_shipment_id_fkey
      FOREIGN KEY (shipment_id) REFERENCES shipping.shipments (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_kind_known') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_kind_known
      CHECK (kind IN ('lost', 'damaged'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_status_known') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_status_known
      CHECK (status IN ('Pending', 'Paid', 'Denied'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_resolved_when_decided') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_resolved_when_decided
      CHECK ((status = 'Pending') = (resolved_at IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_amounts_not_negative') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_amounts_not_negative
      CHECK (amount >= 0 AND (paid_amount IS NULL OR paid_amount >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_created_by_id_fkey') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_updated_by_id_fkey') THEN
    ALTER TABLE shipping.claims ADD CONSTRAINT claims_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_reasons_pkey') THEN
    ALTER TABLE orders.action_reasons ADD CONSTRAINT action_reasons_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_reasons_order_id_fkey') THEN
    ALTER TABLE orders.action_reasons ADD CONSTRAINT action_reasons_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'action_reasons_reason_said_something') THEN
    ALTER TABLE orders.action_reasons ADD CONSTRAINT action_reasons_reason_said_something
      CHECK (length(btrim(reason)) >= 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'action_reasons_created_by_id_fkey') THEN
    ALTER TABLE orders.action_reasons ADD CONSTRAINT action_reasons_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'action_reasons_updated_by_id_fkey') THEN
    ALTER TABLE orders.action_reasons ADD CONSTRAINT action_reasons_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS refunds_order ON payments.refunds (order_id, created_at);
CREATE INDEX IF NOT EXISTS refunds_details ON payments.refunds (details_id);
CREATE INDEX IF NOT EXISTS claims_shipment ON shipping.claims (shipment_id, created_at);
CREATE INDEX IF NOT EXISTS action_reasons_order ON orders.action_reasons (order_id, created_at);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.refunds
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON shipping.claims
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.action_reasons
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
