-- Where a sale line's metal came from, as one expression over the orders.lots
-- row `ol`. Substituted into view.sql and lots/sql/view_for.sql through
-- /*__lot_source_reference__*/. NULL on a purchase line and on a sale line
-- with no recorded source.
--
-- A stock lot it was minted from through the `sale` edge reads as that lot's
-- own "Lot 2481-A" when the stock lot sits on a customer order, or as its
-- refiner order ("RP-12") when it sits on one. A line sourced from a pool
-- lock reads as the refiner order the lock was taken against, or "Pool".
COALESCE(
  (SELECT 'Lot ' || so.number || '-'
          || chr(64 + (SELECT count(*) FROM orders.lots x
                        WHERE x.order_id = sol.order_id
                          AND (x.created_at, x.id) <= (sol.created_at, sol.id))::int)
     FROM inventory.lot_sources se
     JOIN orders.lots sol ON sol.lot_id = se.source_lot_id
     JOIN orders.orders so ON so.id = sol.order_id
    WHERE se.lot_id = ol.lot_id AND se.kind = 'sale'
    ORDER BY se.created_at ASC, se.id ASC
    LIMIT 1),
  (SELECT (CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END) || ro.number
     FROM inventory.lot_sources se
     JOIN refining.lots rl ON rl.lot_id = se.source_lot_id
     JOIN refining.orders ro ON ro.id = rl.refining_order_id
    WHERE se.lot_id = ol.lot_id AND se.kind = 'sale'
    ORDER BY se.created_at ASC, se.id ASC
    LIMIT 1),
  (SELECT COALESCE((CASE ro.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END) || ro.number, 'Pool')
     FROM inventory.pool p
     LEFT JOIN refining.orders ro ON ro.id = p.refining_order_id
    WHERE p.lot_id = ol.lot_id AND p.entry = 'lock'
    ORDER BY p.occurred_at ASC, p.id ASC
    LIMIT 1))
