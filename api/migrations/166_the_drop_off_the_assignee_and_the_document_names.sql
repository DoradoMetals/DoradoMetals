-- Three facts the Orders screens carry that no column held (Jacob's Sep 4-5
-- design notes).
--
-- 1. AN ORDER IS ASSIGNED TO SOMEBODY. The header's Assigned-to select. A
--    refiner order gets the same column, in 160.
--
-- 2. DROP-OFF IS A FULFILLMENT KIND. The reverse of a pickup: we drive sealed
--    lots to a refinery ourselves - driver, refinery, window - and the states
--    are Scheduled -> In Transit -> Dropped Off, which are the two timestamps
--    below and not a status column. A drop-off belongs to a REFINING order, so
--    fulfillments.fulfillments gains refining_order_id beside order_id and a
--    check that it is one or the other, never both. Return Shipment needs
--    nothing: shipping.direction already has 'Return'.
--
-- 3. THE DOCUMENTS HAVE NAMES. Ten of them, and the four the renderer builds
--    today are four of the ten. Naming the other six now is what lets the
--    availability read answer for a method before anything renders them.

ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS assigned_to_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_assigned_fk') THEN
    ALTER TABLE orders.orders ADD CONSTRAINT orders_assigned_fk
      FOREIGN KEY (assigned_to_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_assigned ON orders.orders (assigned_to_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'fulfillments' AND t.typname = 'category' AND e.enumlabel = 'DROPOFF'
  ) THEN
    ALTER TYPE fulfillments.category ADD VALUE 'DROPOFF';
  END IF;
END $$;

ALTER TABLE fulfillments.fulfillments ADD COLUMN IF NOT EXISTS refining_order_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fulfillments_refining_order_fk') THEN
    ALTER TABLE fulfillments.fulfillments ADD CONSTRAINT fulfillments_refining_order_fk
      FOREIGN KEY (refining_order_id) REFERENCES refining.orders (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_fulfillment_serves_one_order') THEN
    ALTER TABLE fulfillments.fulfillments ADD CONSTRAINT a_fulfillment_serves_one_order
      CHECK (order_id IS NULL OR refining_order_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS fulfillments_refining_order
  ON fulfillments.fulfillments (refining_order_id);

CREATE TABLE IF NOT EXISTS fulfillments.dropoffs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fulfillment_id uuid NOT NULL,
  refiner_id uuid,
  location_id uuid,
  driver_employee_id uuid,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  departed_at timestamp with time zone,
  dropped_off_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fulfillments_dropoffs_pkey') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT fulfillments_dropoffs_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dropoffs_fulfillment_fk') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT dropoffs_fulfillment_fk
      FOREIGN KEY (fulfillment_id) REFERENCES fulfillments.fulfillments (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dropoffs_refiner_fk') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT dropoffs_refiner_fk
      FOREIGN KEY (refiner_id) REFERENCES refiners.refiners (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dropoffs_location_fk') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT dropoffs_location_fk
      FOREIGN KEY (location_id) REFERENCES places.locations (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dropoffs_driver_fk') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT dropoffs_driver_fk
      FOREIGN KEY (driver_employee_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_dropoff_arrives_after_it_leaves') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT a_dropoff_arrives_after_it_leaves
      CHECK (dropped_off_at IS NULL OR departed_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_fulfillment_has_one_dropoff') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT a_fulfillment_has_one_dropoff
      UNIQUE (fulfillment_id);
  END IF;
END $$;

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON fulfillments.dropoffs
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

DO $$
DECLARE
  label text;
BEGIN
  FOREACH label IN ARRAY ARRAY[
    'shipping_instructions', 'pickup_manifest', 'pickup_instructions',
    'intake_receipt', 'appointment_instructions', 'settlement', 'lot_manifest'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'media' AND t.typname = 'pdf_kind' AND e.enumlabel = label
    ) THEN
      EXECUTE format('ALTER TYPE media.pdf_kind ADD VALUE %L', label);
    END IF;
  END LOOP;
END $$;
