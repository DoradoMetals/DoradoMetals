-- A LOT IS UNLINKED FROM ITS ORDER, NEVER DELETED (ruling 144).
--
-- DELETE /api/orders/lots/:id used to delete the orders.lots link AND the
-- inventory.lots row: a customer's declared lot, an irreplaceable record. Now
-- removal deletes only the pure link and keeps the lot, and this table is the
-- audit trail: which lot left which order, when, by whom (the audit stamp,
-- ruling 127) and why.
--
-- Purely additive: one new table. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS orders.lot_unlinks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_unlinks_pkey') THEN
    ALTER TABLE orders.lot_unlinks ADD CONSTRAINT lot_unlinks_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_unlinks_reason_written') THEN
    ALTER TABLE orders.lot_unlinks ADD CONSTRAINT lot_unlinks_reason_written
      CHECK (btrim(reason) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_unlinks_order_id_fkey') THEN
    ALTER TABLE orders.lot_unlinks ADD CONSTRAINT lot_unlinks_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_unlinks_lot_id_fkey') THEN
    ALTER TABLE orders.lot_unlinks ADD CONSTRAINT lot_unlinks_lot_id_fkey
      FOREIGN KEY (lot_id) REFERENCES inventory.lots (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'lot_unlinks_created_by_id_fkey') THEN
    ALTER TABLE orders.lot_unlinks ADD CONSTRAINT lot_unlinks_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'lot_unlinks_updated_by_id_fkey') THEN
    ALTER TABLE orders.lot_unlinks ADD CONSTRAINT lot_unlinks_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lot_unlinks_order ON orders.lot_unlinks (order_id, created_at);
CREATE INDEX IF NOT EXISTS lot_unlinks_lot ON orders.lot_unlinks (lot_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.lot_unlinks
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
