-- The admin order screens, closing the API gaps in
-- docs/waves/admin-orders-screen-gaps.md. Six subjects, all additive:
--
-- 1. A REFINER ORDER HAS AN OFFICE AND CAN BE CANCELLED (GAP 4, GAP 5). The
--    header's Location select is places.locations; cancelling is a timestamp,
--    and the pooling index has to stop counting a cancelled sell order as the
--    one open one, or a refiner could never be given a second.
--
-- 2. A PICKUP HAS AN OFFICE (GAP 17). fulfillments.directs already carries
--    location_id; a pickup is dispatched from one too.
--
-- 3. A PARCEL CARRIES ITS COVER AND WHO PAYS THE RETURN (GAP 15, GAP 16).
--    `insured` already exists; what the operator adds on top of the declared
--    value did not, and neither did the return-billing choice.
--
-- 4. A MONEY MOVEMENT CAN BELONG TO A REFINER ORDER (GAP 12). payments.transfers
--    pointed only at orders.orders, so a refiner had no payout row at all. One
--    key or the other, never both and never neither, and the one-live-movement
--    index gets its sibling.
--
-- 5. A STORED DOCUMENT CAN BELONG TO A REFINER ORDER (GAP 26). The refiner's
--    settlement statement is imported against their order, not a customer's.
--
-- 6. A FULFILLMENT STATUS IS A FIXED VOCABULARY (GAP 19). It was free text, so
--    the six operator transitions in the design notes were labels the browser
--    decided. Dev holds PENDING, SCHEDULED and COMPLETED; the enum adds the
--    four the notes name and nothing is rewritten.
--
-- `exchange` is neither read nor written.

ALTER TABLE refining.orders ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE refining.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_orders_location_fk') THEN
    ALTER TABLE refining.orders ADD CONSTRAINT refining_orders_location_fk
      FOREIGN KEY (location_id) REFERENCES places.locations (id);
  END IF;
END $$;

DROP INDEX IF EXISTS refining.one_open_sell_order_per_refiner;
CREATE UNIQUE INDEX one_open_sell_order_per_refiner
  ON refining.orders (refiner_id)
  WHERE sent_at IS NULL AND cancelled_at IS NULL AND direction = 'sell'::refining.direction;

ALTER TABLE fulfillments.pickups ADD COLUMN IF NOT EXISTS location_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fulfillment_pickups_location_fk') THEN
    ALTER TABLE fulfillments.pickups ADD CONSTRAINT fulfillment_pickups_location_fk
      FOREIGN KEY (location_id) REFERENCES places.locations (id);
  END IF;
END $$;

ALTER TABLE shipping.shipments ADD COLUMN IF NOT EXISTS additional_coverage numeric;
ALTER TABLE shipping.shipments
  ADD COLUMN IF NOT EXISTS bill_return_to_customer boolean DEFAULT false NOT NULL;

ALTER TABLE payments.transfers ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payments.transfers ADD COLUMN IF NOT EXISTS refining_order_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_refining_order_fk') THEN
    ALTER TABLE payments.transfers ADD CONSTRAINT transfers_refining_order_fk
      FOREIGN KEY (refining_order_id) REFERENCES refining.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_transfer_moves_for_one_order') THEN
    ALTER TABLE payments.transfers ADD CONSTRAINT a_transfer_moves_for_one_order
      CHECK ((order_id IS NULL) <> (refining_order_id IS NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS transfers_one_live_per_refining_order_kind
  ON payments.transfers (refining_order_id, kind) WHERE state <> 'Failed';

CREATE INDEX IF NOT EXISTS transfers_refining_order_idx
  ON payments.transfers (refining_order_id);

ALTER TABLE media.pdfs ADD COLUMN IF NOT EXISTS refining_order_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdfs_refining_order_fk') THEN
    ALTER TABLE media.pdfs ADD CONSTRAINT pdfs_refining_order_fk
      FOREIGN KEY (refining_order_id) REFERENCES refining.orders (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_pdf_belongs_to_one_order') THEN
    ALTER TABLE media.pdfs ADD CONSTRAINT a_pdf_belongs_to_one_order
      CHECK (order_id IS NULL OR refining_order_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pdfs_refining_order_kind
  ON media.pdfs (refining_order_id, kind, created_at DESC);

DO $$ BEGIN
  CREATE TYPE fulfillments.fulfillment_status AS ENUM
    ('PENDING', 'SCHEDULED', 'IN_TRANSIT', 'PICKED_UP', 'IN_PROGRESS',
     'COMPLETED', 'DROPPED_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'fulfillments' AND table_name = 'fulfillments'
         AND column_name = 'status') <> 'USER-DEFINED' THEN
    ALTER TABLE fulfillments.fulfillments ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE fulfillments.fulfillments
      ALTER COLUMN status TYPE fulfillments.fulfillment_status
      USING status::fulfillments.fulfillment_status;
    ALTER TABLE fulfillments.fulfillments
      ALTER COLUMN status SET DEFAULT 'PENDING'::fulfillments.fulfillment_status;
  END IF;
END $$;
