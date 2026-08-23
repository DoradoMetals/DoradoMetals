-- The refiner's spot for an order, derived from exchange.
--
-- exchange.refiner_metals is the same shape as exchange.order_metals - a row per
-- order and metal, naming the metal as text and carrying a column for each kind
-- of order - and it becomes refiners.spots by the same transformation that
-- turned order_metals into orders.spots:
--
--   purchase_order_id / sales_order_id  ->  order_id
--   type                                ->  metal_id
--   ask_spot / bid_spot                 ->  ask / bid
--
-- percent_change and dollar_change do not come across, for the reason recorded
-- in 031: they are null on every row in exchange and nothing writes them. The
-- read projects null without a column to hold it.
--
-- Two columns have no source in exchange:
--
--   refiner_id. exchange has never recorded which refinery an order went to -
--   the same fact already settled for orders.orders.refinery_id - so it stays
--   null rather than being invented.
--
--   pool_oz_deducted. It lives on exchange.purchase_orders, not on the metals
--   row, and orders.orders already carries it. Left null here rather than
--   duplicated; the order is the one place it is stated.
--
-- Production's refiners.spots holds 232 rows from the abandoned January
-- migration which share NO ids with exchange.refiner_metals - they are residue,
-- and rule 062 applies: exchange is the source of truth. They go first, or the
-- insert would sit alongside a stale copy of the same orders.
--
-- Destructive to the new schema only, which is derived and unpromoted.

-- refiner_id is NOT NULL and exchange has no source for it, so it has to be
-- relaxed before anything can be derived - the same step 064 took for
-- refiners.items, and for the same reason. A refiner spot with no refiner is a
-- fact about what exchange recorded, not a hole in the data.
ALTER TABLE refiners.spots ALTER COLUMN refiner_id DROP NOT NULL;

-- Guard ---------------------------------------------------------------
DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'refiners.spots' t WHERE EXISTS (
      SELECT 1 FROM refiners.spots s
      WHERE EXISTS (SELECT 1 FROM exchange.refiner_metals e WHERE e.id = s.id)
        AND NOT EXISTS (
          SELECT 1 FROM exchange.refiner_metals e
          WHERE e.id = s.id
            AND coalesce(e.purchase_order_id, e.sales_order_id) = s.order_id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill refiner spots: % holds rows that disagree with exchange, so something has been written that exchange does not have.',
      offender;
  END IF;
END $$;

-- Residue from January: rows carrying ids exchange has never issued.
DELETE FROM refiners.spots s
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.refiner_metals e WHERE e.id = s.id
);

INSERT INTO refiners.spots (
  id, order_id, metal_id, ask, bid,
  scrap_percentage, bullion_percentage, created_at, updated_at
)
SELECT
  m.id,
  coalesce(m.purchase_order_id, m.sales_order_id),
  mt.id,
  m.ask_spot,
  m.bid_spot,
  m.scrap_percentage,
  m.bullion_percentage,
  m.created_at,
  m.updated_at
FROM exchange.refiner_metals m
JOIN metals.metals mt ON mt.name = m.type
WHERE coalesce(m.purchase_order_id, m.sales_order_id) IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM orders.orders o
    WHERE o.id = coalesce(m.purchase_order_id, m.sales_order_id)
  )
ON CONFLICT (id) DO UPDATE SET
  order_id            = EXCLUDED.order_id,
  metal_id            = EXCLUDED.metal_id,
  ask                 = EXCLUDED.ask,
  bid                 = EXCLUDED.bid,
  scrap_percentage    = EXCLUDED.scrap_percentage,
  bullion_percentage  = EXCLUDED.bullion_percentage,
  updated_at          = EXCLUDED.updated_at;
