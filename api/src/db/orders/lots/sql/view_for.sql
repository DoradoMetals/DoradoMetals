-- One order's lots, each with the physical row, what it is called, what it is
-- worth and where it went. The reference is "Lot 2481-A": the order's number
-- and a letter per lot, in placement order, which is what the admin screens and
-- the refiner's paperwork quote.
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
            'payable', CASE WHEN li.content IS NULL OR ol.premium IS NULL THEN NULL
                            ELSE li.content * ol.premium END,
            'line_total', CASE WHEN ol.price IS NULL THEN NULL
                               WHEN li.bullion_id IS NULL THEN ol.price
                               ELSE ol.price * li.quantity END,
            'settled', CASE WHEN li.bullion_id IS NOT NULL THEN ol.confirmed
                            ELSE EXISTS (SELECT 1 FROM refining.lots rl
                                          WHERE rl.lot_id = ol.lot_id
                                            AND rl.settled_at IS NOT NULL) END,
            'refining_order_number',
              (SELECT ro.number FROM refining.lots rl
                 JOIN refining.orders ro ON ro.id = rl.refining_order_id
                WHERE rl.lot_id = ol.lot_id)) AS view
  FROM (SELECT l.*,
               row_number() OVER (PARTITION BY l.order_id ORDER BY l.created_at ASC, l.id ASC) AS seat
          FROM orders.lots l
         WHERE l.order_id = $1) ol
  JOIN lots.items li ON li.id = ol.lot_id
  JOIN orders.orders o ON o.id = ol.order_id
  LEFT JOIN products.bullion b ON b.id = li.bullion_id
 ORDER BY ol.seat ASC
