-- The engagement owns the refinery, and the fulfillment chain is verified whole.
--
-- The second half of 093's deferred drop, landing TOGETHER with the code
-- repoint (the flip-together rule): every read and write of
-- orders.orders.refinery_id now goes to refiners.orders.refiner_id - the
-- sales-order reads join the engagement, setRefinery upserts it, the dual
-- mirrors derive it - so the column can finally go.
--
-- THE PRESERVATION STORY, spelled out because a DROP demands one:
--
--   1. 093's BACKFILL 1 copied every refinery_id value into
--      refiners.orders.refiner_id when the engagement rows were created.
--   2. Writes that landed on the column BETWEEN 093 and this migration
--      (setRefinery wrote orders.orders until the code repoint) are re-seeded
--      below, into engagements whose refiner_id is still NULL.
--   3. A row where the column and the engagement DISAGREE, both non-null, is
--      refused loudly - that is a divergence a human decides, not a coalesce.
--   4. Only then does the column drop. Its index (idx_orders_refinery_id) and
--      foreign key (orders_refinery_id_fkey) go with it.
--
-- Everything is guarded and idempotent; a re-run after the drop parses (the
-- column-touching statements are dynamic SQL inside DO blocks) and does
-- nothing.

-- ---------------------------------------------------------------------------
-- The engagement invariant, completed for rows born between 093 and now.
--
-- 093 backfilled one engagement per order; the CODE did not maintain it until
-- this migration's companion change (the mirrors and create paths ensure the
-- row now). Any order created in between has no engagement, and any refiner
-- item/spot mirrored in between has no refiner_order_id link. Same statements
-- as 093's backfills, so a re-run inserts and updates nothing.

INSERT INTO refiners.orders (order_id)
SELECT o.id FROM orders.orders o
ON CONFLICT (order_id) DO NOTHING;

UPDATE refiners.items ri
   SET refiner_order_id = ro.id
  FROM orders.items oi, refiners.orders ro
 WHERE oi.id = ri.order_item_id
   AND ro.order_id = oi.order_id
   AND ri.refiner_order_id IS NULL;

UPDATE refiners.spots rs
   SET refiner_order_id = ro.id
  FROM refiners.orders ro
 WHERE ro.order_id = rs.order_id
   AND rs.refiner_order_id IS NULL;

INSERT INTO refiners.items (order_item_id, refiner_order_id, bullion_id, metal_id, quantity)
SELECT oi.id, ro.id, oi.bullion_id, oi.metal_id, coalesce(oi.quantity, 1)
  FROM orders.items oi
  JOIN refiners.orders ro ON ro.order_id = oi.order_id
 WHERE NOT EXISTS (SELECT 1 FROM refiners.items ri WHERE ri.order_item_id = oi.id);

INSERT INTO refiners.spots (order_id, refiner_order_id, metal_id)
SELECT os.order_id, ro.id, os.metal_id
  FROM orders.spots os
  JOIN refiners.orders ro ON ro.order_id = os.order_id
 WHERE NOT EXISTS (
   SELECT 1 FROM refiners.spots rs
    WHERE rs.order_id = os.order_id AND rs.metal_id = os.metal_id
 );

-- ---------------------------------------------------------------------------
-- refinery_id: re-seed the stragglers, refuse a disagreement, then drop.

DO $$
DECLARE
  has_refinery boolean;
  disagreements integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'orders' AND table_name = 'orders'
       AND column_name = 'refinery_id'
  ) INTO has_refinery;

  IF NOT has_refinery THEN
    RETURN;  -- already dropped; the re-seed has already happened.
  END IF;

  -- Writes that reached the column after 093's seed. NULL engagements only:
  -- the engagement is authoritative, so a value it already holds is not
  -- overwritten by the shadow.
  EXECUTE $sql$
    UPDATE refiners.orders ro
       SET refiner_id = o.refinery_id, updated_at = now()
      FROM orders.orders o
     WHERE o.id = ro.order_id
       AND o.refinery_id IS NOT NULL
       AND ro.refiner_id IS NULL
  $sql$;

  EXECUTE $sql$
    SELECT count(*) FROM orders.orders o
      JOIN refiners.orders ro ON ro.order_id = o.id
     WHERE o.refinery_id IS NOT NULL
       AND ro.refiner_id IS NOT NULL
       AND ro.refiner_id <> o.refinery_id
  $sql$ INTO disagreements;

  IF disagreements > 0 THEN
    RAISE EXCEPTION
      'refusing to drop orders.orders.refinery_id: % order(s) carry a refinery_id '
      'that disagrees with the engagement''s refiner_id. Decide which is right '
      'before this column can go.', disagreements;
  END IF;

  -- Every value is now in refiners.orders.refiner_id. The drop takes
  -- idx_orders_refinery_id and orders_refinery_id_fkey with it.
  EXECUTE 'ALTER TABLE orders.orders DROP COLUMN refinery_id';
END $$;

-- ---------------------------------------------------------------------------
-- The fulfillment chain, completed and then VERIFIED whole.
--
-- Ruling 9's ninth delta: a shipment is reached from its order through
-- fulfillments - order -> fulfillments.fulfillments -> fulfillments.shipments
-- -> shipping.shipments - and never by a direct order id on the shipment row.
-- shipping.shipments has NEVER carried an order id column (checked against
-- genesis and dev, asserted below), so the "seed-then-drop" this migration was
-- planned around resolves to: complete the chain, prove it, and pin the
-- absence of the direct link.
--
-- The completion restates 052's two inserts. They matter here because the
-- live shipment-create path skips the fulfillment when the order is not in
-- orders.orders yet ("best-effort, deliberately"), so a shipment created in
-- that window is a real parcel with no chain. Idempotent, exchange only read.

INSERT INTO fulfillments.fulfillments (
  order_id, method_id, status, created_by, updated_by, created_at, updated_at
)
SELECT DISTINCT ON (coalesce(e.purchase_order_id, e.sales_order_id))
  coalesce(e.purchase_order_id, e.sales_order_id),
  m.id,
  CASE WHEN e.shipping_status = 'Delivered' THEN 'COMPLETED' ELSE 'PENDING' END,
  NULL, NULL,
  e.created_at, e.created_at
FROM exchange.shipments e
JOIN fulfillments.methods m
  ON m.type = CASE e.pickup_type
                WHEN 'Store Dropoff' THEN 'CARRIER DROPOFF'
                WHEN 'DropShip'      THEN 'DROPSHIP'
              END
 AND m.direction = (CASE WHEN e.purchase_order_id IS NOT NULL THEN 'purchase' ELSE 'sale' END)::orders.direction
WHERE coalesce(e.purchase_order_id, e.sales_order_id) IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = coalesce(e.purchase_order_id, e.sales_order_id))
ORDER BY coalesce(e.purchase_order_id, e.sales_order_id), e.created_at
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO fulfillments.shipments (
  fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
)
SELECT
  f.id,
  e.id,
  CASE WHEN e.type = 'Inbound'
       THEN (SELECT l.id FROM places.locations l WHERE l.type = 'FEDEX_OFFICE' LIMIT 1) END,
  CASE WHEN e.type = 'Outbound'
       THEN (SELECT l.id FROM places.locations l WHERE l.type = 'REFINER_OFFICE' LIMIT 1) END
FROM exchange.shipments e
JOIN fulfillments.fulfillments f
  ON f.order_id = coalesce(e.purchase_order_id, e.sales_order_id)
WHERE EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = e.id)
  AND NOT EXISTS (SELECT 1 FROM fulfillments.shipments fs WHERE fs.shipment_id = e.id)
ON CONFLICT (shipment_id) DO NOTHING;

-- THE PROOF. Two refusals, each naming what it found:
--
--   1. A shipment exchange can reach by order id that the chain cannot reach
--      is a shipment the bare-resource reads would lose.
--   2. A direct order id column on shipping.shipments would mean this
--      database diverged from every schema this repo has ever built - refuse
--      and investigate, never silently drop a column that might hold data.
--
-- THERE WAS A THIRD, AND IT IS GONE (2026-09-06, prod-day fixes). It counted
-- exchange.carrier_pickups and raised while any row existed, on the reasoning
-- that shipping.pickups keys on a SHIPMENT and an exchange.carrier_pickups row
-- keys on the ORDER, so the chain modelled no home for one. That refusal was
-- written when "both databases hold zero today" was true. It stopped being
-- true - dev accumulated six from the dual era - and it turned a from-nothing
-- migration of dev into an abort at 094, with production's own count unknown.
--
-- Jacob, 2026-09-06: production holds NONE of these, dev's six are sandbox
-- test rows, and they are NOT carried. So there is nothing to strand and no
-- backfill to wait for. exchange.carrier_pickups keeps its rows, frozen and
-- readable, exactly like every other exchange table; nothing here deletes or
-- writes one. shipping.pickups is declared in verify-backfill.mjs's
-- NOT_REBUILT with the same reason, which is where the decision is now
-- checked rather than in an unconditional RAISE.
DO $$
DECLARE
  unreachable integer;
  has_direct_order_id boolean;
BEGIN
  SELECT count(*) INTO unreachable
    FROM exchange.shipments e
   WHERE coalesce(e.purchase_order_id, e.sales_order_id) IS NOT NULL
     AND EXISTS (SELECT 1 FROM orders.orders o
                  WHERE o.id = coalesce(e.purchase_order_id, e.sales_order_id))
     AND EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = e.id)
     AND NOT EXISTS (
       SELECT 1 FROM fulfillments.shipments fs
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      WHERE fs.shipment_id = e.id
        AND f.order_id = coalesce(e.purchase_order_id, e.sales_order_id)
     );
  IF unreachable > 0 THEN
    RAISE EXCEPTION
      'the fulfillment chain is incomplete: % shipment(s) reachable by order id '
      'in exchange cannot be reached through fulfillments.', unreachable;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'shipping' AND table_name = 'shipments'
       AND column_name IN ('order_id', 'purchase_order_id', 'sales_order_id')
  ) INTO has_direct_order_id;
  IF has_direct_order_id THEN
    RAISE EXCEPTION
      'shipping.shipments carries a direct order id column this repo never '
      'created - investigate where it came from before anything drops it.';
  END IF;
END $$;
