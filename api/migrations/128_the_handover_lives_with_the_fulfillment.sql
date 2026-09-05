-- RULINGS 69 + 70 (Jacob, 2026-09-04): "Checkout/Orders shouldn't care about
-- what's going on over in fulfillment world." "Everything needs to stay in its
-- own lane. The only thing that should be deciding if fulfillments is 'ready'
-- is fulfillments."
--
-- checkout.checkouts carried NINE columns describing how the order would be
-- handed over - a shipper address, a box, a carrier service, a courier slot,
-- a collection address, a store, an appointment time and the fulfillment
-- method itself. Ruling 68 then had checkout READ them to decide, by category,
-- what was still missing. That is checkout deciding fulfillment readiness,
-- which 70 forbids, and no lint could ever catch it while the columns lived
-- on checkout's own row.
--
-- SO THE COLUMNS MOVE TO THE DETAIL ROW OF THE DRAFT FULFILLMENT, which is
-- where the same value lives once an order exists. 111 predicted this exactly:
-- "Under the draft model those live on the fulfillment and its children. The
-- columns are all-NULL and nothing reads them; they stay until the checkout
-- conversion is proven, then leave with their own migration." This is that
-- migration, and the destinations already existed:
--
--   SHIPMENT  shipping.shipments.shipper_address_id / package_id /
--             carrier_service_id, reached through fulfillments.shipments
--   PICKUP    fulfillments.pickups.pickup_address_id / start_time
--   DIRECT    fulfillments.directs.location_id / start_time
--   method    fulfillments.fulfillments.method_id
--
-- TWO THINGS WERE GENUINELY MISSING, and only two:
--
--   1. THE COURIER SLOT. shipping.shipments has no column for the date and
--      time the customer asked the carrier to come. domain/shipping/labels.ts
--      says so in its own comment - "no column remembers a courier's requested
--      slot" - and passed it as an argument from the checkout row instead.
--      TEXT, for the same reason 113 made them text: they are the provider's
--      own strings, combined into a timestamp inside Postgres where needed.
--      shipping.pickups is NOT the home: that row is the carrier's ANSWER
--      (confirmation number, location, status), written after the label is
--      bought, and a slot that has been asked for but not yet booked has no
--      row there at all.
--
--   2. A DRAFT'S DETAIL ROW STARTS EMPTY. fulfillments.pickups.pickup_address_id
--      and fulfillments.directs.location_id are NOT NULL, which was right when
--      the only way to get one was to schedule it. A draft now creates its
--      detail row the moment the method is chosen, and the customer fills it
--      in one PATCH at a time, so both widen to nullable. Widening only -
--      nothing is dropped and every existing row still satisfies it.
--
-- WHAT IS DROPPED IS checkout.checkouts' NINE COLUMNS, and that is deliberate.
-- `lint:migrations` guards `exchange`, which this schema is not, and CLAUDE.md
-- is explicit that `checkout.*` is device-sync rather than a ledger: "A cart
-- exists so a customer sees the same basket on their phone as on their laptop.
-- Empty is fine, losing it is fine." The moves below still carry every value
-- across before the drop, because an in-flight checkout losing its half-made
-- choices is a bad afternoon even when it is not a covenant breach.
--
-- MEASURED READ-ONLY ON DEV FIRST (2026-09-04): 6 checkout rows, and ZERO
-- non-null values in all nine columns - 0 shipper_address_id, 0 package_id,
-- 0 carrier_service_id, 0 pickup_date, 0 pickup_time, 0 pickup_address_id,
-- 0 appointment_location_id, 0 appointment_time, 0 fulfillment_method_id -
-- and 0 draft fulfillments. So on dev the four moves below carry nothing and
-- the drop loses nothing, provably. They are written for the databases that
-- are not dev.
--
-- recipient_address_id STAYS ON CHECKOUT. See docs/waves/boundary-feature.md:
-- it is the sale's TAX key, read by domain/orders/place.ts to price the order
-- before any fulfillment exists, and 123's composite foreign key
-- (user_id, recipient_address_id) -> places.user_addresses is a statement
-- about the CHECKOUT's owner that no fulfillment row could make.

-- ---------------------------------------------------------------- 1. widen

ALTER TABLE fulfillments.pickups ALTER COLUMN pickup_address_id DROP NOT NULL;
ALTER TABLE fulfillments.directs ALTER COLUMN location_id DROP NOT NULL;

ALTER TABLE shipping.shipments
  ADD COLUMN IF NOT EXISTS pickup_date text,
  ADD COLUMN IF NOT EXISTS pickup_time text;

-- ------------------------------------------------- 2. a method with no draft
--
-- A checkout that named a method but never got a draft fulfillment (the state
-- January's columns left behind) gets one now, so the value has somewhere to
-- land. Drafts carry no order_id, so the one-fulfillment-per-order unique
-- index is untouched.

-- 2026-09-06 (ruling 82 rehearsal): sections 2 to 5 read nine columns of
-- checkout.checkouts that SECTION 6 OF THIS SAME FILE drops. On a genesis
-- build - the shape after 133, which is what ruling 82 gives production - they
-- are already gone and the statements cannot even parse, so the chain aborted
-- here. The whole data half is now guarded on one of those columns and run
-- through EXECUTE, which defers the parse. Nothing is lost by skipping it: a
-- genesis build has no carts at all, because checkout is device-sync and no
-- backfill writes it.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'checkout' AND table_name = 'checkouts'
       AND column_name = 'fulfillment_method_id'
  ) THEN
    RAISE NOTICE '128: checkout.checkouts has already lost its January columns; sections 2-5 have nothing to move';
    RETURN;
  END IF;

  EXECUTE $sql$
      WITH minted AS (
        INSERT INTO fulfillments.fulfillments (method_id, status)
        SELECT c.fulfillment_method_id, 'PENDING'
          FROM checkout.checkouts c
         WHERE c.fulfillment_method_id IS NOT NULL
           AND c.fulfillment_id IS NULL
        RETURNING id, method_id
      ),
      paired AS (
        SELECT c.id AS checkout_id,
               (SELECT m.id FROM minted m
                 WHERE m.method_id = c.fulfillment_method_id
                 LIMIT 1) AS fulfillment_id
          FROM checkout.checkouts c
         WHERE c.fulfillment_method_id IS NOT NULL
           AND c.fulfillment_id IS NULL
      )
      UPDATE checkout.checkouts c
         SET fulfillment_id = p.fulfillment_id
        FROM paired p
       WHERE c.id = p.checkout_id
         AND p.fulfillment_id IS NOT NULL;
  $sql$;

  EXECUTE $sql$
      -- ------------------------------------------------------- 3. the parcel facts
      --
      -- A SHIPMENT draft holding parcel choices needs a shell and a link, because
      -- before this migration the shell was only ever created at placement.

      WITH wants_shell AS (
        SELECT c.id AS checkout_id, c.fulfillment_id, c.direction
          FROM checkout.checkouts c
          JOIN fulfillments.fulfillments f ON f.id = c.fulfillment_id
          JOIN fulfillments.methods m ON m.id = f.method_id
         WHERE m.category = 'SHIPMENT'
           AND f.order_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM fulfillments.shipments fs WHERE fs.fulfillment_id = f.id
           )
           AND (c.shipper_address_id IS NOT NULL OR c.package_id IS NOT NULL
             OR c.carrier_service_id IS NOT NULL
             OR c.pickup_date IS NOT NULL OR c.pickup_time IS NOT NULL)
      ),
      shells AS (
        INSERT INTO shipping.shipments (direction)
        SELECT CASE WHEN w.direction = 'sale' THEN 'Outbound'::shipping.direction
                    ELSE 'Inbound'::shipping.direction END
          FROM wants_shell w
        RETURNING id
      ),
      numbered_shells AS (
        SELECT id, row_number() OVER (ORDER BY id) AS n FROM shells
      ),
      numbered_wants AS (
        SELECT fulfillment_id, row_number() OVER (ORDER BY checkout_id) AS n FROM wants_shell
      )
      INSERT INTO fulfillments.shipments (fulfillment_id, shipment_id)
      SELECT w.fulfillment_id, s.id
        FROM numbered_wants w
        JOIN numbered_shells s ON s.n = w.n;

      UPDATE shipping.shipments s
         SET shipper_address_id = COALESCE(s.shipper_address_id, c.shipper_address_id),
             package_id         = COALESCE(s.package_id, c.package_id),
             carrier_service_id = COALESCE(s.carrier_service_id, c.carrier_service_id),
             pickup_date        = COALESCE(s.pickup_date, c.pickup_date),
             pickup_time        = COALESCE(s.pickup_time, c.pickup_time)
        FROM fulfillments.shipments fs
        JOIN checkout.checkouts c ON c.fulfillment_id = fs.fulfillment_id
       WHERE s.id = fs.shipment_id
         AND (c.shipper_address_id IS NOT NULL OR c.package_id IS NOT NULL
           OR c.carrier_service_id IS NOT NULL
           OR c.pickup_date IS NOT NULL OR c.pickup_time IS NOT NULL);

      -- --------------------------------------------------------- 4. the collection

      INSERT INTO fulfillments.pickups (fulfillment_id, pickup_address_id, start_time)
      SELECT c.fulfillment_id, c.pickup_address_id, c.appointment_time
        FROM checkout.checkouts c
        JOIN fulfillments.fulfillments f ON f.id = c.fulfillment_id
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE m.category = 'PICKUP'
         AND (c.pickup_address_id IS NOT NULL OR c.appointment_time IS NOT NULL)
         AND NOT EXISTS (
           SELECT 1 FROM fulfillments.pickups p WHERE p.fulfillment_id = f.id
         );

      UPDATE fulfillments.pickups p
         SET pickup_address_id = COALESCE(p.pickup_address_id, c.pickup_address_id),
             start_time        = COALESCE(p.start_time, c.appointment_time)
        FROM checkout.checkouts c
       WHERE p.fulfillment_id = c.fulfillment_id
         AND (c.pickup_address_id IS NOT NULL OR c.appointment_time IS NOT NULL);

      -- ------------------------------------------------------- 5. the store visit

      INSERT INTO fulfillments.directs (fulfillment_id, location_id, is_appointment, start_time)
      SELECT c.fulfillment_id, c.appointment_location_id, true, c.appointment_time
        FROM checkout.checkouts c
        JOIN fulfillments.fulfillments f ON f.id = c.fulfillment_id
        JOIN fulfillments.methods m ON m.id = f.method_id
       WHERE m.category = 'DIRECT'
         AND (c.appointment_location_id IS NOT NULL OR c.appointment_time IS NOT NULL)
         AND NOT EXISTS (
           SELECT 1 FROM fulfillments.directs d WHERE d.fulfillment_id = f.id
         );

      UPDATE fulfillments.directs d
         SET location_id = COALESCE(d.location_id, c.appointment_location_id),
             start_time  = COALESCE(d.start_time, c.appointment_time)
        FROM checkout.checkouts c
       WHERE d.fulfillment_id = c.fulfillment_id
         AND (c.appointment_location_id IS NOT NULL OR c.appointment_time IS NOT NULL);
  $sql$;
END $do$;

-- ------------------------------------------------------------- 6. the drop
--
-- The three composite "is this address in the caller's book" foreign keys from
-- 123 go with their columns; the recipient one is deliberately kept, and
-- db/checkout/checkouts/repo.ts's deferAddressOwnership now names only it.

ALTER TABLE checkout.checkouts
  DROP COLUMN IF EXISTS shipper_address_id,
  DROP COLUMN IF EXISTS package_id,
  DROP COLUMN IF EXISTS carrier_service_id,
  DROP COLUMN IF EXISTS pickup_date,
  DROP COLUMN IF EXISTS pickup_time,
  DROP COLUMN IF EXISTS pickup_address_id,
  DROP COLUMN IF EXISTS appointment_location_id,
  DROP COLUMN IF EXISTS appointment_time,
  DROP COLUMN IF EXISTS fulfillment_method_id;
