-- runs-even-under-a-baseline: genesis stops creating orders.items and checkout.items once 193 drops them, and the rebuild chain from 028 to 173 still writes and reads both on its way to lots
--
-- THE TWO ITEM TABLES ARE STAGING, NOT DESTINATIONS.
--
-- `orders.items` and `checkout.items` are the intermediate the exchange-era
-- backfills build before 161 and 162 turn every row into a lot. Migration 193
-- drops them, so genesis - which is dumped from dev - no longer creates them,
-- and a build from nothing would reach 028 with nowhere to write.
--
-- This file is that shape, lifted verbatim from what genesis emitted before
-- 193, and it carries `runs-even-under-a-baseline` because it looks like pure
-- DDL genesis reproduces and is exactly the case where that is false.
--
-- Against a database that still holds the tables - dev, and every database
-- that ran genesis before 193 - every statement here is a no-op.

CREATE TABLE IF NOT EXISTS orders.items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  bullion_id uuid,
  metal_id text NOT NULL,
  pre_melt numeric,
  post_melt numeric,
  purity numeric,
  content numeric,
  premium numeric,
  quantity numeric DEFAULT 1,
  confirmed boolean DEFAULT false NOT NULL,
  sales_tax_charged numeric DEFAULT 0 NOT NULL,
  unit text,
  price numeric
);

CREATE TABLE IF NOT EXISTS checkout.items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bullion_id uuid,
  metal_id text,
  checkout_id uuid NOT NULL,
  pre_melt numeric,
  post_melt numeric,
  purity numeric,
  premium numeric,
  quantity numeric,
  created_by text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  content numeric,
  unit text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_pkey'
                   AND conrelid = 'orders.items'::regclass) THEN
    ALTER TABLE orders.items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_purity_range'
                   AND conrelid = 'orders.items'::regclass) THEN
    ALTER TABLE orders.items ADD CONSTRAINT items_purity_range
      CHECK (((purity >= (0)::numeric) AND (purity <= (1)::numeric)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_items_pkey'
                   AND conrelid = 'checkout.items'::regclass) THEN
    ALTER TABLE checkout.items ADD CONSTRAINT checkout_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_bullion_id ON orders.items USING btree (bullion_id);
CREATE INDEX IF NOT EXISTS idx_order_items_metal_id ON orders.items USING btree (metal_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON orders.items USING btree (order_id);
CREATE INDEX IF NOT EXISTS checkout_items_bullion_idx ON checkout.items USING btree (bullion_id);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_items_checkout_bullion_key ON checkout.items USING btree (checkout_id, bullion_id);
CREATE INDEX IF NOT EXISTS checkout_items_checkout_idx ON checkout.items USING btree (checkout_id);
CREATE INDEX IF NOT EXISTS checkout_items_metal_idx ON checkout.items USING btree (metal_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_bullion_id_fkey'
                   AND conrelid = 'orders.items'::regclass) THEN
    ALTER TABLE orders.items ADD CONSTRAINT order_items_bullion_id_fkey
      FOREIGN KEY (bullion_id) REFERENCES products.bullion(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_metal_id_fkey'
                   AND conrelid = 'orders.items'::regclass) THEN
    ALTER TABLE orders.items ADD CONSTRAINT order_items_metal_id_fkey
      FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey'
                   AND conrelid = 'orders.items'::regclass) THEN
    ALTER TABLE orders.items ADD CONSTRAINT order_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders.orders(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_items_bullion_fk'
                   AND conrelid = 'checkout.items'::regclass) THEN
    ALTER TABLE checkout.items ADD CONSTRAINT checkout_items_bullion_fk
      FOREIGN KEY (bullion_id) REFERENCES products.bullion(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_items_checkout_fk'
                   AND conrelid = 'checkout.items'::regclass) THEN
    ALTER TABLE checkout.items ADD CONSTRAINT checkout_items_checkout_fk
      FOREIGN KEY (checkout_id) REFERENCES checkout.checkouts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_items_metal_fk'
                   AND conrelid = 'checkout.items'::regclass) THEN
    ALTER TABLE checkout.items ADD CONSTRAINT checkout_items_metal_fk
      FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refiners_items_order_item_id_fk'
                   AND conrelid = 'refiners.items'::regclass) THEN
    ALTER TABLE refiners.items ADD CONSTRAINT refiners_items_order_item_id_fk
      FOREIGN KEY (order_item_id) REFERENCES orders.items(id) ON DELETE CASCADE;
  END IF;
END $$;
