-- A LOT'S PURITY CAN BE DISPUTED (Figma card 1209:15545, "Purity dispute").
--
-- The card shows our assay, the customer's claimed purity and where it came
-- from, the reason, and once resolved the resolution. A dispute is a fact, so
-- it is a row: opened at/by are the audit stamp (created_at, created_by_id,
-- ruling 127); our_purity is the lot's purity when the dispute opened, so a
-- later re-assay does not rewrite what was disputed; resolved_at,
-- resolved_by_id and resolution close it. One open dispute per lot at a time.
--
-- Purely additive: one new table. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS orders.purity_disputes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  our_purity numeric,
  claimed_purity numeric NOT NULL,
  claim_source text,
  reason text NOT NULL,
  resolution text,
  resolved_at timestamp with time zone,
  resolved_by_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_disputes_pkey') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_disputes_claimed_range') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_claimed_range
      CHECK (claimed_purity > 0 AND claimed_purity <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_disputes_reason_written') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_reason_written
      CHECK (btrim(reason) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_disputes_resolved_whole') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_resolved_whole
      CHECK ((resolved_at IS NULL) = (resolution IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_disputes_order_id_fkey') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_disputes_lot_id_fkey') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_lot_id_fkey
      FOREIGN KEY (lot_id) REFERENCES inventory.lots (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'purity_disputes_resolved_by_id_fkey') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_resolved_by_id_fkey
      FOREIGN KEY (resolved_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'purity_disputes_created_by_id_fkey') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'purity_disputes_updated_by_id_fkey') THEN
    ALTER TABLE orders.purity_disputes ADD CONSTRAINT purity_disputes_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purity_disputes_order ON orders.purity_disputes (order_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS purity_disputes_one_open
  ON orders.purity_disputes (lot_id) WHERE resolved_at IS NULL;

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.purity_disputes
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
