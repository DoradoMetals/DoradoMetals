-- The refiner-side engagement becomes its own entity: refiners.orders.
--
-- Jacob, 28 August 2026: "refiner.items don't all have order.id, they have
-- refiner.orders.id... and that way pool_oz_deducted can go on that instead"
-- - extended the same day with "same thing with refiner_fees etc etc" and
-- "just make a refiner order for every single order". A fact about the
-- refiner engagement lands on refiners.orders: the pool ounces, the
-- remediation, the refinery's fee, and WHICH refinery has the metal. The
-- exchange columns (and their orders.transactions mirror) stay as the
-- dual-written shadow while both schemas serve.
--
-- ONE ENGAGEMENT PER ORDER, EVERY ORDER, BOTH DIRECTIONS - an engagement row
-- exists even while it holds no refiner facts yet, so the count pairs hold by
-- construction: orders.orders = refiners.orders, and after the mirror
-- completion below, orders.items = refiners.items. (orders.spots is the one
-- pair that CANNOT equal by addition: unlocking an order's spots CLEARS its
-- customer rows while the refiner's copies stay, so refiners.spots is a
-- superset - dev holds 4 such rows. Counted and pinned in the invariant test
-- rather than papered over.)
--
-- orders.orders.refinery_id MOVES HERE - it was engagement data sitting on
-- the order row. The seed below copies every value into
-- refiners.orders.refiner_id (31 of 60 dev rows carry one); the DROP is
-- deferred to the next migration, which lands together with the code repoint
-- (see the note at the end of this file). The exchange-side supplier linkage
-- (exchange.sales_orders.supplier_id) is untouched and keeps its dual shadow.
--
-- EVERYTHING ELSE IS NEW-SCHEMA AND ADDITIVE, and every backfill statement is
-- WHERE-guarded and idempotent (re-run convention: second run inserts and
-- updates nothing).
--
-- UNIQUE(order_id): one engagement per customer order today. A future where
-- one order splits across refiners (multi-lot) relaxes this to
-- UNIQUE(order_id, refiner_id) - the pk is its own uuid precisely so that
-- relaxation is a constraint change, not a rekeying.

CREATE TABLE IF NOT EXISTS refiners.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders.orders(id),
  refiner_id        uuid REFERENCES refiners.refiners(id),
  pool_oz_deducted  numeric,
  pool_remediation  numeric,
  fee               numeric,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

-- The engagement link. order_item_id STAYS the link to the customer's line -
-- that is what every read keys on today; refiner_order_id is the new parent.
-- refiners.spots.order_id becomes redundant once refiner_order_id lands and
-- retires with a later migration, once nothing reads it.
ALTER TABLE refiners.items ADD COLUMN IF NOT EXISTS
  refiner_order_id uuid REFERENCES refiners.orders(id);
ALTER TABLE refiners.spots ADD COLUMN IF NOT EXISTS
  refiner_order_id uuid REFERENCES refiners.orders(id);

-- The lookups the new endpoints make (audit:query-paths' lesson: a WHERE
-- written fresh against the new schema has no exchange index to be compared
-- against, so it gets its index the day it gets its query).
CREATE INDEX IF NOT EXISTS refiners_orders_order_id_idx ON refiners.orders (order_id);
CREATE INDEX IF NOT EXISTS refiners_items_refiner_order_id_idx ON refiners.items (refiner_order_id);
CREATE INDEX IF NOT EXISTS refiners_spots_refiner_order_id_idx ON refiners.spots (refiner_order_id);

-- BACKFILL 1: the engagement rows - one per order, every order.
--
-- Seeds, chosen from the data as it actually is (inspected 2026-08-28):
--
--   refiner_id   orders.orders.refinery_id FIRST (31 of 60 dev rows carry
--                one - it was always engagement data); where that is null,
--                the single refiner the order's refiners.items rows agree on
--                (24 of 41 dev item rows carry one; disagreement would seed
--                NULL, and none does).
--   pool values  orders.transactions, which mirrors exchange.purchase_orders.
--                NOT refiners.spots' pool_oz_deducted column: dev holds ZERO
--                non-null values there, so transactions is the only
--                populated source.
--   fee          orders.transactions.refiner_fee, same mirror argument.
-- A DO block with the refinery_id half as dynamic SQL, because the NEXT
-- migration drops the column: a re-run of this file after that one - or a
-- retry of a partial apply - must not fail to PARSE against a schema without
-- it. Once the column is gone the seed has already happened, so the fallback
-- derivation is all that remains to run.
DO $$
DECLARE
  has_refinery boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'orders' AND table_name = 'orders'
       AND column_name = 'refinery_id'
  ) INTO has_refinery;

  EXECUTE format($sql$
    INSERT INTO refiners.orders (order_id, refiner_id, pool_oz_deducted, pool_remediation, fee)
    SELECT
      o.id,
      coalesce(
        %s,
        -- min() has no uuid form, hence the text round-trip. HAVING with no
        -- GROUP BY makes the whole set one group: exactly one distinct
        -- non-null refiner yields it, disagreement or absence yields no row.
        (SELECT min(ri.refiner_id::text)::uuid
           FROM refiners.items ri
           JOIN orders.items oi ON oi.id = ri.order_item_id
          WHERE oi.order_id = o.id AND ri.refiner_id IS NOT NULL
         HAVING count(DISTINCT ri.refiner_id) = 1)
      ),
      t.pool_oz_deducted,
      t.pool_remediation,
      t.refiner_fee
    FROM orders.orders o
    LEFT JOIN orders.transactions t ON t.order_id = o.id
    ON CONFLICT (order_id) DO NOTHING
  $sql$, CASE WHEN has_refinery THEN 'o.refinery_id' ELSE 'NULL::uuid' END);
END $$;

-- BACKFILL 2: wire the engagement onto the rows that already exist.
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

-- BACKFILL 3: mirror completion. Every customer line gets its refiner
-- counterpart (values NULL until a refiner reports - the same shape 064 chose
-- for the rows it created), and every customer spot row gets the refiner's,
-- unquoted. After this, orders.items = refiners.items by count and
-- orders.spots has no row without a refiners.spots counterpart.
INSERT INTO refiners.orders (order_id)
SELECT o.id FROM orders.orders o
ON CONFLICT (order_id) DO NOTHING;

-- Every one of the 16 dev lines this creates is a BULLION line on a SALES
-- order (measured 2026-08-28): refiners.items historically existed only for
-- the purchase flow, so outbound goods never got rows. bullion_id rides over
-- from the line, metal_id is the line's own (resolved from the product at
-- insert), and the assay values stay NULL - nothing was assayed, these are
-- outbound goods.
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

-- THE COLUMN'S DROP IS DEFERRED, DELIBERATELY, and this is the covenant rule
-- applied to itself. Every refinery_id value is copied into
-- refiners.orders.refiner_id by BACKFILL 1 above - the seed is the
-- preservation story - but the LIVE dual mirrors still write the column
-- (repo.next.ts mirrorOrder names it in its INSERT, and the sales-order read
-- selects it), so dropping it here would break every mirrored order write
-- the moment this migration applied. Proven, not supposed: the refiner
-- engagement tests execute this file inside their rolled-back transaction,
-- and with the DROP in place every subsequent dual write failed 42703. The
-- drop lands in the next migration TOGETHER with the code repoint (mirrors
-- and reads moving to refiners.orders.refiner_id), the same
-- flip-together rule the *_SOURCE switches exist for. Until then the column
-- is redundant-but-alive: the engagement is authoritative, the column is a
-- shadow nothing should newly read.

-- refiners.transactions was drafted here and WITHDRAWN the same day (Jacob:
-- "actually probably don't need refiner.transactions") before this migration
-- was ever applied anywhere. If settlements do become a recorded thing, they
-- are a fresh migration with their own reasoning - nothing to derive them
-- from exists in any schema, so nothing is lost by not creating the table.
