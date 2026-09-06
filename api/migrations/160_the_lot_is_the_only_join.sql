-- The lot is the only join (ruling 98).
--
-- Three item tables become one table of physical things plus link tables that
-- carry only the money of their own stage. A lot's id is minted in the basket
-- and is the same id the refiner settles, so one customer order's lots may go
-- to several refiner orders and one refiner order may hold lots of several
-- customer orders. No foreign key joins the two orders; the lot is the join.
--
-- CONTENT IS GENERATED, WITH ONE CORRECTION TO docs/model/lots.md. That
-- write-up derives a catalogue lot's content as gross x purity and gates the
-- migration on `products.bullion.content = gross * purity` being true of the
-- whole catalogue. Measured on dev 2026-09-08: it is true of ONE of 62 rows.
-- The catalogue's `content` is the ADVERTISED FINE content and its `gross` is
-- the gross weight; for 61 rows the two are equal and the purity is the
-- fineness of the metal, so deriving content would apply purity a second time -
-- the exact defect migration 134 was written to remove. So a catalogue lot
-- SNAPSHOTS its fine content in `content_snapshot` (ruling 51) and `content`
-- generates from it; a scrap lot has no snapshot and generates from its own
-- weights through `metals.fine_content`, the one definition. One expression, in
-- the database, indexable, and impossible for two reads to disagree about.
--
-- Additive. Six tables, two schemas, nothing dropped, exchange untouched.

CREATE SCHEMA IF NOT EXISTS lots;
CREATE SCHEMA IF NOT EXISTS refining;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'direction' AND n.nspname = 'refining') THEN
    CREATE TYPE refining.direction AS ENUM ('sell', 'buy');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'pool_entry' AND n.nspname = 'refining') THEN
    CREATE TYPE refining.pool_entry AS ENUM ('credit', 'lock');
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS refining.order_number_seq AS bigint START WITH 1001;

CREATE TABLE IF NOT EXISTS lots.items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bullion_id uuid,
  metal_id text NOT NULL,
  unit text DEFAULT 't oz'::text NOT NULL,
  quantity numeric DEFAULT 1 NOT NULL,
  pre_melt numeric,
  post_melt numeric,
  purity numeric,
  content_snapshot numeric,
  content numeric GENERATED ALWAYS AS (
    CASE WHEN content_snapshot IS NOT NULL THEN content_snapshot
         ELSE metals.fine_content(COALESCE(post_melt, pre_melt), unit, purity) END
  ) STORED,
  image_id uuid,
  split_from_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS checkout.lots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  checkout_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS orders.lots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  premium numeric,
  price numeric,
  sales_tax_charged numeric DEFAULT 0 NOT NULL,
  confirmed boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS refining.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  number bigint DEFAULT nextval('refining.order_number_seq') NOT NULL,
  direction refining.direction NOT NULL,
  refiner_id uuid NOT NULL,
  assigned_to_id uuid,
  sent_at timestamp with time zone,
  settled_at timestamp with time zone,
  disputed_at timestamp with time zone,
  expected_settlement_on date,
  assay_lab text,
  fee numeric,
  statement_reference text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS refining.lots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  refining_order_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  unit text DEFAULT 't oz'::text NOT NULL,
  pre_melt numeric,
  post_melt numeric,
  purity numeric,
  content numeric GENERATED ALWAYS AS (
    metals.fine_content(COALESCE(post_melt, pre_melt), unit, purity)
  ) STORED,
  premium numeric,
  settled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS refining.pool (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  refiner_id uuid NOT NULL,
  metal_id text NOT NULL,
  entry refining.pool_entry NOT NULL,
  troy_oz numeric NOT NULL,
  lock_price numeric,
  refining_order_id uuid NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid
);

-- Keys and constraints ------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_items_pkey') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lots_items_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_lots_pkey') THEN
    ALTER TABLE checkout.lots ADD CONSTRAINT checkout_lots_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_lots_pkey') THEN
    ALTER TABLE orders.lots ADD CONSTRAINT orders_lots_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_orders_pkey') THEN
    ALTER TABLE refining.orders ADD CONSTRAINT refining_orders_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_lots_pkey') THEN
    ALTER TABLE refining.lots ADD CONSTRAINT refining_lots_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_pool_pkey') THEN
    ALTER TABLE refining.pool ADD CONSTRAINT refining_pool_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_items_bullion_fk') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lots_items_bullion_fk
      FOREIGN KEY (bullion_id) REFERENCES products.bullion (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_items_metal_fk') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lots_items_metal_fk
      FOREIGN KEY (metal_id) REFERENCES metals.metals (id) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_items_image_fk') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lots_items_image_fk
      FOREIGN KEY (image_id) REFERENCES media.images (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_items_split_fk') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lots_items_split_fk
      FOREIGN KEY (split_from_id) REFERENCES lots.items (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_product_lot_is_not_melted') THEN
    ALTER TABLE lots.items ADD CONSTRAINT a_product_lot_is_not_melted
      CHECK (bullion_id IS NULL OR post_melt IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_snapshot_belongs_to_a_product') THEN
    ALTER TABLE lots.items ADD CONSTRAINT a_snapshot_belongs_to_a_product
      CHECK (content_snapshot IS NULL OR bullion_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lot_is_not_its_own_parent') THEN
    ALTER TABLE lots.items ADD CONSTRAINT a_lot_is_not_its_own_parent
      CHECK (split_from_id IS DISTINCT FROM id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_weights_are_positive') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lot_weights_are_positive
      CHECK (COALESCE(pre_melt, 1) > 0 AND COALESCE(post_melt, 1) > 0 AND quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_purity_is_a_fraction') THEN
    ALTER TABLE lots.items ADD CONSTRAINT lot_purity_is_a_fraction
      CHECK (purity IS NULL OR (purity > 0 AND purity <= 1));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_lots_checkout_fk') THEN
    ALTER TABLE checkout.lots ADD CONSTRAINT checkout_lots_checkout_fk
      FOREIGN KEY (checkout_id) REFERENCES checkout.checkouts (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkout_lots_lot_fk') THEN
    ALTER TABLE checkout.lots ADD CONSTRAINT checkout_lots_lot_fk
      FOREIGN KEY (lot_id) REFERENCES lots.items (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lot_sits_in_one_basket') THEN
    ALTER TABLE checkout.lots ADD CONSTRAINT a_lot_sits_in_one_basket UNIQUE (lot_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_lots_order_fk') THEN
    ALTER TABLE orders.lots ADD CONSTRAINT orders_lots_order_fk
      FOREIGN KEY (order_id) REFERENCES orders.orders (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_lots_lot_fk') THEN
    ALTER TABLE orders.lots ADD CONSTRAINT orders_lots_lot_fk
      FOREIGN KEY (lot_id) REFERENCES lots.items (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lot_sits_on_one_order') THEN
    ALTER TABLE orders.lots ADD CONSTRAINT a_lot_sits_on_one_order UNIQUE (lot_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lot_premium_is_not_negative') THEN
    ALTER TABLE orders.lots ADD CONSTRAINT order_lot_premium_is_not_negative
      CHECK (premium IS NULL OR premium >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_orders_number_key') THEN
    ALTER TABLE refining.orders ADD CONSTRAINT refining_orders_number_key UNIQUE (number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_orders_refiner_fk') THEN
    ALTER TABLE refining.orders ADD CONSTRAINT refining_orders_refiner_fk
      FOREIGN KEY (refiner_id) REFERENCES refiners.refiners (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_orders_assigned_fk') THEN
    ALTER TABLE refining.orders ADD CONSTRAINT refining_orders_assigned_fk
      FOREIGN KEY (assigned_to_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settled_after_sent') THEN
    ALTER TABLE refining.orders ADD CONSTRAINT settled_after_sent
      CHECK (settled_at IS NULL OR sent_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_lots_order_fk') THEN
    ALTER TABLE refining.lots ADD CONSTRAINT refining_lots_order_fk
      FOREIGN KEY (refining_order_id) REFERENCES refining.orders (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_lots_lot_fk') THEN
    ALTER TABLE refining.lots ADD CONSTRAINT refining_lots_lot_fk
      FOREIGN KEY (lot_id) REFERENCES lots.items (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lot_goes_to_one_refiner') THEN
    ALTER TABLE refining.lots ADD CONSTRAINT a_lot_goes_to_one_refiner UNIQUE (lot_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settled_lots_carry_a_premium') THEN
    ALTER TABLE refining.lots ADD CONSTRAINT settled_lots_carry_a_premium
      CHECK (settled_at IS NULL OR premium IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_pool_refiner_fk') THEN
    ALTER TABLE refining.pool ADD CONSTRAINT refining_pool_refiner_fk
      FOREIGN KEY (refiner_id) REFERENCES refiners.refiners (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_pool_metal_fk') THEN
    ALTER TABLE refining.pool ADD CONSTRAINT refining_pool_metal_fk
      FOREIGN KEY (metal_id) REFERENCES metals.metals (id) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_pool_order_fk') THEN
    ALTER TABLE refining.pool ADD CONSTRAINT refining_pool_order_fk
      FOREIGN KEY (refining_order_id) REFERENCES refining.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_lock_has_a_price') THEN
    ALTER TABLE refining.pool ADD CONSTRAINT a_lock_has_a_price
      CHECK (entry <> 'lock' OR lock_price IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_credit_adds_and_a_lock_takes') THEN
    ALTER TABLE refining.pool ADD CONSTRAINT a_credit_adds_and_a_lock_takes
      CHECK ((entry = 'credit' AND troy_oz > 0) OR (entry = 'lock' AND troy_oz < 0));
  END IF;
END $$;

-- Indexes -------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS lots_items_bullion ON lots.items (bullion_id);
CREATE INDEX IF NOT EXISTS lots_items_metal ON lots.items (metal_id);
CREATE INDEX IF NOT EXISTS lots_items_split ON lots.items (split_from_id);
CREATE INDEX IF NOT EXISTS checkout_lots_checkout ON checkout.lots (checkout_id);
CREATE INDEX IF NOT EXISTS orders_lots_order ON orders.lots (order_id);
CREATE INDEX IF NOT EXISTS refining_orders_refiner
  ON refining.orders (refiner_id, direction, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_sell_order_per_refiner
  ON refining.orders (refiner_id) WHERE sent_at IS NULL AND direction = 'sell';
CREATE INDEX IF NOT EXISTS refining_lots_order ON refining.lots (refining_order_id);
CREATE INDEX IF NOT EXISTS pool_balance ON refining.pool (refiner_id, metal_id, occurred_at);

-- The stamps ----------------------------------------------------------------
--
-- 116's insert branch COALESCEs created_at/updated_at rather than assigning
-- them, so the backfills that follow supply both and they survive.

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON lots.items
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON checkout.lots
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.lots
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON refining.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON refining.lots
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON refining.pool
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
