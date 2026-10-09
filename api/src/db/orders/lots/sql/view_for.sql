-- One order's lots, each with the physical row, what it is called, what it is
-- worth and where it went. The reference is "Lot 2481-A": the order's number
-- and a letter per lot, in placement order, which is what the admin screens and
-- the refiner's paperwork quote.
--
-- PRICE IS DERIVED, NEVER STORED (ruling 120): content x premium x spot, where
-- spot is the order's own frozen orders.spots row for that metal - bid for a
-- purchase, ask for a sale - once the order's spots are locked, and the live
-- adjusted spots.resolved figure until then. This mirrors db/pricing/sql/order_pricing.sql
-- exactly, so a read here and a priced quote never disagree. A scrap lot's
-- `settled` and its refiner order number reach the refiner lot through the
-- `batch` edge in inventory.lot_sources, because `refining.lots` is itself
-- now a pure link.
SELECT to_jsonb(ol)
       || jsonb_build_object(
            'created_at', to_char(ol.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(ol.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'lot', to_jsonb(li)
                   || jsonb_build_object(
                        'created_at', to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'updated_at', to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'product_name', b.name,
                        'form', COALESCE(b.type, 'Scrap'),
                        'reference', 'Lot ' || o.number || '-' || chr(64 + ol.seat::int)),
            'payable', CASE WHEN li.content IS NULL OR li.premium IS NULL THEN NULL
                            ELSE li.content * li.premium END,
            'price', pr.price,
            'line_total', CASE WHEN pr.price IS NULL THEN NULL
                               WHEN li.bullion_id IS NULL THEN pr.price
                               ELSE pr.price * li.quantity END,
            'settled', CASE WHEN li.bullion_id IS NOT NULL THEN li.confirmed_at IS NOT NULL
                            ELSE EXISTS (SELECT 1 FROM inventory.lot_sources ls
                                          JOIN inventory.lots rlot ON rlot.id = ls.lot_id
                                         WHERE ls.source_lot_id = ol.lot_id
                                           AND ls.kind = 'batch'
                                           AND rlot.settled_at IS NOT NULL) END,
            'refining_order_number',
              (SELECT ro.number FROM inventory.lot_sources ls
                 JOIN refining.lots rl ON rl.lot_id = ls.lot_id
                 JOIN refining.orders ro ON ro.id = rl.refining_order_id
                WHERE ls.source_lot_id = ol.lot_id AND ls.kind = 'batch'
                LIMIT 1)) AS view
  FROM (SELECT l.*,
               row_number() OVER (PARTITION BY l.order_id ORDER BY l.created_at ASC, l.id ASC) AS seat
          FROM orders.lots l
         WHERE l.order_id = $1) ol
  JOIN inventory.lots li ON li.id = ol.lot_id
  JOIN orders.orders o ON o.id = ol.order_id
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
  LEFT JOIN orders.spots os ON os.order_id = ol.order_id AND os.metal_id = li.metal_id
  LEFT JOIN spots.resolved sp ON sp.metal_id = li.metal_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN li.content IS NULL OR li.premium IS NULL THEN NULL
                ELSE li.content * li.premium
                     * COALESCE(
                         CASE WHEN o.direction = 'sale'
                              THEN CASE WHEN o.spots_locked THEN COALESCE(os.ask, sp.ask) ELSE sp.ask END
                              ELSE CASE WHEN o.spots_locked THEN COALESCE(os.bid, sp.bid) ELSE sp.bid END END,
                         0)
           END AS price
  ) pr
 ORDER BY ol.seat ASC
