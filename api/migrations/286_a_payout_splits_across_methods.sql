-- A PAYOUT SPLITS ACROSS METHODS ONLY WHEN ASKED (ruling 132).
--
-- By default a purchase pays out by one method, the one the customer chose at
-- checkout (orders.transactions.payout_details_id), with no amount: it pays
-- the whole total. "Add payout method" makes a split, and only then does each
-- method carry an amount. A split is these rows: two or more per order, each
-- with an amount, summing to the order's total (orders/rules.ts checks the
-- sum). No rows means the default single method.
--
-- Purely additive: one new table. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS orders.payout_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  method_id uuid NOT NULL,
  amount numeric(16,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_methods_pkey') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_methods_order_method') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_order_method
      UNIQUE (order_id, method_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_methods_amount_positive') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_amount_positive
      CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_methods_order_id_fkey') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_methods_method_id_fkey') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_method_id_fkey
      FOREIGN KEY (method_id) REFERENCES payments.methods (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'payout_methods_created_by_id_fkey') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'payout_methods_updated_by_id_fkey') THEN
    ALTER TABLE orders.payout_methods ADD CONSTRAINT payout_methods_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payout_methods_method ON orders.payout_methods (method_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.payout_methods
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
