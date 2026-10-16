-- The seated ancestors of a lot that has no orders.lots seat of its own: a lot
-- combined (or split) from others is nobody's order line, but its parents are.
-- Substituted through /*__lot_parents__*/ into a FROM, correlated on `sl` (the
-- seatless lot). Walks `combine` and `split` edges upward until it reaches a lot
-- that holds a seat, at most eight steps. One row per seated parent, with the
-- parent's own `Lot 2481-A` reference and its order's `PO-2481`.
WITH RECURSIVE up AS (
  SELECT e.source_lot_id AS lot_id, e.created_at, 1 AS depth
    FROM inventory.lot_sources e
   WHERE e.lot_id = sl.id AND e.kind IN ('combine', 'split')
  UNION ALL
  SELECT e.source_lot_id, up.created_at, up.depth + 1
    FROM up
    JOIN inventory.lot_sources e ON e.lot_id = up.lot_id AND e.kind IN ('combine', 'split')
   WHERE up.depth < 8
     AND NOT EXISTS (SELECT 1 FROM orders.lots seated WHERE seated.lot_id = up.lot_id)
)
SELECT up.lot_id, up.created_at, po.id AS order_id, po.number AS order_number,
       po.direction::text AS order_direction,
       jsonb_build_object(
         'lot_id', up.lot_id,
         'order_id', po.id,
         'reference', 'Lot ' || po.number || '-' || chr(64 + pseat.n::int),
         'order_reference', (CASE WHEN po.direction = 'sale' THEN 'SO-' ELSE 'PO-' END)
                            || po.number) AS parent
  FROM up
  JOIN orders.lots pol ON pol.lot_id = up.lot_id
  JOIN orders.orders po ON po.id = pol.order_id
 CROSS JOIN LATERAL (
        SELECT count(*) AS n
          FROM orders.lots ppeer
         WHERE ppeer.order_id = pol.order_id
           AND (ppeer.created_at, ppeer.id) <= (pol.created_at, pol.id)
       ) pseat
