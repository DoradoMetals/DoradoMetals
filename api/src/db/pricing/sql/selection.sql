-- WHAT A SELECTION OF ORDERS ADDS UP TO, for the selection bar (ruling 151).
-- $1 is the selected order ids. `estimated_value` is the sum of each order's
-- order_value.sql, the same expression the order list prints, so
-- the bar and the cards cannot disagree. `fine_oz` is the fine content per
-- metal, weighed the way order_pricing.sql weighs a line: a catalogue line
-- counts its quantity, a scrap line its content once.
WITH picked AS (
  SELECT o.id, o.direction, o.spots_locked
    FROM orders.orders o
   WHERE o.id = ANY($1::uuid[])
),
valued AS (
  SELECT /*__order_estimated_value__*/ AS estimated_value
    FROM picked o
),
picked_lots AS (
  SELECT li.metal_id,
         CASE WHEN li.bullion_id IS NULL
              THEN COALESCE(li.content, 0)
              ELSE COALESCE(li.content, 0) * li.quantity END AS weighed
    FROM orders.lots ol
    JOIN inventory.lots li ON li.id = ol.lot_id
   WHERE ol.order_id IN (SELECT id FROM picked)
),
metals AS (
  SELECT metal_id, sum(weighed) AS oz
    FROM picked_lots
   GROUP BY metal_id
)
SELECT json_build_object(
         'order_count', (SELECT count(*)::int FROM picked),
         'lot_count', (SELECT count(*)::int FROM picked_lots),
         'estimated_value', (SELECT COALESCE(sum(estimated_value), 0) FROM valued),
         'fine_oz', COALESCE((SELECT json_agg(json_build_object('metal_id', m.metal_id,
                                                                'oz', m.oz)
                                              ORDER BY m.metal_id)
                                FROM metals m), '[]'::json)
       ) AS selection
