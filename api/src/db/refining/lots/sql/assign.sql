-- Batching MINTS a refiner lot per named customer lot - a copy of our
-- figures at that moment, to be overwritten by what the refiner reports -
-- and joins it to ours with a `batch` edge (ruling 120). `refining.lots`
-- keeps only the link, pointed at the MINTED lot, never at the customer's.
-- `content_snapshot` is not copied: the minted lot's content generates from
-- its own weights.
--
-- The new lot's id is generated once, in `input` - the database still
-- creates it (ruling 72), just in a plain read before the writes rather than
-- from a DEFAULT - so `minted`, `edges` and the final link all carry the
-- SAME id without needing to correlate rows after the fact: RETURNING
-- cannot use a window function, so there is no row_number() to lean on.
-- `edges` reads FROM `minted` (and the final INSERT reads FROM `edges`) so
-- each write is forced to run after the one whose foreign key it needs -
-- data-modifying CTEs with no such dependency run in an unspecified order.
--
-- `assertUnassigned` runs before this, in the service - a customer lot
-- already reached through a `batch` edge is refused there, not here.
WITH input AS (
  SELECT customer_lot_id, ord, gen_random_uuid() AS new_lot_id
    FROM unnest($2::uuid[]) WITH ORDINALITY AS u(customer_lot_id, ord)
),
customers AS (
  SELECT i.ord, i.new_lot_id, li.bullion_id, li.metal_id, li.unit, li.quantity, li.pre_melt,
         li.post_melt, li.purity, li.image_id, li.premium, li.id AS source_lot_id
    FROM input i
    JOIN inventory.lots li ON li.id = i.customer_lot_id
),
minted AS (
  INSERT INTO inventory.lots (id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt,
                               purity, image_id, premium)
  SELECT new_lot_id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
         image_id, premium
    FROM customers
  RETURNING id
),
edges AS (
  INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
  SELECT c.new_lot_id, c.source_lot_id, 'batch'
    FROM minted m
    JOIN customers c ON c.new_lot_id = m.id
  RETURNING lot_id
)
INSERT INTO refining.lots (refining_order_id, lot_id)
SELECT $1, e.lot_id
  FROM edges e
  JOIN customers c ON c.new_lot_id = e.lot_id
 ORDER BY c.ord
RETURNING id, refining_order_id, lot_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
