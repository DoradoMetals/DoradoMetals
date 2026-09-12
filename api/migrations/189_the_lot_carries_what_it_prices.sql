-- PREMIUM LIVES ON THE LOT (ruling 120). One lot prices for exactly one order,
-- so the premium is a value OF the lot and `orders.lots` keeps nothing but the
-- link.
--
-- Four more values come with it, for the same reason:
--
--   sales_tax_rate  `orders.lots.sales_tax_charged` never held money - it held
--                   the RATE the line was taxed at (`SoldLotPrice.sales_tax`
--                   is `sale_quote.sql`'s `sales_tax_rate`, and the dollars
--                   live once on `orders.transactions.sales_tax`). It is
--                   renamed to what it is.
--   confirmed_at    `orders.lots.confirmed` said an employee agreed the
--                   figures. That is a fact about the metal, and a fact is a
--                   timestamp (ruling 112).
--   settled_at      the refiner's report lands on a lot; 190 mints the refiner
--                   lots that carry it.
--   settled_spot    spots are per PRICING EVENT, not per refiner order: a
--                   settlement can be partial, so each lot records the metal's
--                   spot at the moment Record settlement ran. The refiner
--                   order's value is derived from its lots, never stored.
--   source          a sale line's sourcing choice - inventory, refiner or
--                   pool.
--
-- A lot that sits on two orders would have two premiums and only one column to
-- hold them. None does, on dev or on a production-shaped copy, and the count
-- is reported either way; where one exists, the SALE side is minted as its own
-- lot with a `sale` edge, which is what the model says a sale lot is.
--
-- `exchange` is neither read nor written.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'inventory' AND t.typname = 'lot_source') THEN
    CREATE TYPE inventory.lot_source AS ENUM ('inventory', 'refiner', 'pool');
  END IF;
END $$;

ALTER TABLE inventory.lots
  ADD COLUMN IF NOT EXISTS premium numeric,
  ADD COLUMN IF NOT EXISTS sales_tax_rate numeric,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS settled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS settled_spot numeric,
  ADD COLUMN IF NOT EXISTS source inventory.lot_source;

WITH doubled AS (
  SELECT ol.id AS link_id, ol.lot_id
    FROM orders.lots ol
    JOIN orders.orders o ON o.id = ol.order_id
   WHERE o.direction = 'sale'
     AND EXISTS (SELECT 1 FROM orders.lots peer
                  WHERE peer.lot_id = ol.lot_id AND peer.id <> ol.id)
), minted AS (
  INSERT INTO inventory.lots
         (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
          content_snapshot, image_id, created_at, updated_at)
  SELECT li.bullion_id, li.metal_id, li.unit, li.quantity, li.pre_melt, li.post_melt,
         li.purity, li.content_snapshot, li.image_id, li.created_at, li.updated_at
    FROM doubled d
    JOIN inventory.lots li ON li.id = d.lot_id
  RETURNING id
), paired AS (
  SELECT d.link_id, d.lot_id AS source_lot_id, m.id AS sale_lot_id
    FROM (SELECT link_id, lot_id, row_number() OVER (ORDER BY link_id) AS n FROM doubled) d
    JOIN (SELECT id, row_number() OVER (ORDER BY id) AS n FROM minted) m ON m.n = d.n
), edged AS (
  INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
  SELECT sale_lot_id, source_lot_id, 'sale' FROM paired
  ON CONFLICT (lot_id, source_lot_id, kind) DO NOTHING
  RETURNING id
)
UPDATE orders.lots ol
   SET lot_id = paired.sale_lot_id
  FROM paired
 WHERE ol.id = paired.link_id;

UPDATE inventory.lots li
   SET premium = ol.premium,
       sales_tax_rate = NULLIF(ol.sales_tax_charged, 0),
       confirmed_at = CASE WHEN ol.confirmed THEN ol.updated_at END
  FROM orders.lots ol
 WHERE ol.lot_id = li.id
   AND li.premium IS NULL
   AND li.sales_tax_rate IS NULL
   AND li.confirmed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_premium_is_not_negative'
                   AND conrelid = 'inventory.lots'::regclass) THEN
    ALTER TABLE inventory.lots ADD CONSTRAINT lot_premium_is_not_negative
      CHECK (premium IS NULL OR premium >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lots_settled ON inventory.lots USING btree (settled_at)
  WHERE settled_at IS NOT NULL;

DO $$
DECLARE
  carried bigint;
  taxed bigint;
  confirmed bigint;
  split_off bigint;
BEGIN
  SELECT count(*) FILTER (WHERE premium IS NOT NULL),
         count(*) FILTER (WHERE sales_tax_rate IS NOT NULL),
         count(*) FILTER (WHERE confirmed_at IS NOT NULL)
    INTO carried, taxed, confirmed FROM inventory.lots;
  SELECT count(*) INTO split_off FROM inventory.lot_sources WHERE kind = 'sale';
  RAISE NOTICE 'lots: % premium(s), % tax rate(s) and % confirmation(s) carried off orders.lots; % sale lot(s) minted for a lot that sat on two orders',
    carried, taxed, confirmed, split_off;
END $$;
