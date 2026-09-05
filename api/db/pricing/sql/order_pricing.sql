WITH ord AS (
  SELECT o.id, o.direction, COALESCE(o.spots_locked, false) AS spots_locked
    FROM orders.orders o
   WHERE o.id = $1::uuid
),
lines AS (
  SELECT oi.id,
         oi.bullion_id,
         oi.metal_id,
         m.name AS metal,
         COALESCE(oi.content, 0) AS content,
         COALESCE(oi.quantity, 1) AS quantity,
         oi.premium AS stored_premium,
         oi.price AS stored_price,
         CASE WHEN ord.spots_locked THEN os.bid ELSE s.bid END AS bid,
         CASE WHEN oi.bullion_id IS NULL
              THEN COALESCE(oi.content, 0)
              ELSE COALESCE(oi.content, 0) * COALESCE(oi.quantity, 1) END AS weighed
    FROM orders.items oi
    JOIN ord ON ord.id = oi.order_id
    LEFT JOIN metals.metals m ON m.id = oi.metal_id
    LEFT JOIN orders.spots os ON os.order_id = oi.order_id AND os.metal_id = oi.metal_id
    LEFT JOIN spots.spots s ON s.metal_id = oi.metal_id
),
by_metal AS (
  SELECT metal_id, sum(weighed) AS total FROM lines GROUP BY metal_id
),
tiered AS (
  SELECT l.*,
         CASE WHEN ord.direction <> 'purchase' THEN NULL
              WHEN l.bullion_id IS NULL THEN band.scrap_pct
              ELSE band.bullion_pct END AS retier_premium
    FROM lines l
   CROSS JOIN ord
    LEFT JOIN by_metal t ON t.metal_id = l.metal_id
    LEFT JOIN LATERAL (
           SELECT r.scrap_pct, r.bullion_pct
             FROM rates.rates r
            WHERE r.metal_id = l.metal_id
            ORDER BY (t.total >= r.min_qty
                      AND (r.max_qty IS NULL OR t.total <= r.max_qty)) DESC,
                     CASE WHEN t.total >= r.min_qty
                               AND (r.max_qty IS NULL OR t.total <= r.max_qty)
                          THEN r.min_qty END ASC NULLS LAST,
                     CASE WHEN t.total < (SELECT min(r2.min_qty)
                                            FROM rates.rates r2
                                           WHERE r2.metal_id = l.metal_id)
                          THEN r.min_qty END ASC NULLS LAST,
                     r.min_qty DESC,
                     r.id ASC
            LIMIT 1
         ) band ON TRUE
),
priced AS (
  SELECT t.id,
         CASE WHEN t.bullion_id IS NULL THEN 'scrap' ELSE 'product' END AS kind,
         CASE WHEN t.stored_price IS NULL THEN 'quoted' ELSE 'stored' END AS source,
         t.bullion_id,
         t.metal_id,
         t.metal,
         t.content,
         t.quantity,
         COALESCE(t.stored_premium, t.retier_premium, 0) AS premium,
         t.retier_premium,
         t.bid,
         t.stored_price,
         COALESCE(
           t.stored_price,
           t.content * (COALESCE(t.bid, 0) * COALESCE(t.stored_premium, t.retier_premium, 0))
         ) AS unit_price
    FROM tiered t
),
lined AS (
  SELECT p.*,
         CASE WHEN p.bullion_id IS NULL THEN p.unit_price
              ELSE p.unit_price * p.quantity END AS line_total
    FROM priced p
),
totals AS (
  SELECT COALESCE(sum(CASE WHEN l.bullion_id IS NULL THEN l.line_total ELSE 0 END), 0)
           AS scrap_total,
         COALESCE(sum(CASE WHEN l.bullion_id IS NULL THEN 0 ELSE l.line_total END), 0)
           AS bullion_total
    FROM lined l
),
carriage AS (
  SELECT COALESCE(sh.cost, 0) AS shipping_charge
    FROM ord
    JOIN fulfillments.fulfillments f ON f.order_id = ord.id
    JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
    JOIN shipping.shipments sh ON sh.id = fs.shipment_id
   WHERE sh.direction <> 'Return'
   ORDER BY sh.created_at ASC, sh.id ASC
   LIMIT 1
),
payout AS (
  SELECT CASE WHEN t.waive_payout_fee = true THEN 0
              ELSE COALESCE(t.payout_fee, 0) END AS payout_fee
    FROM ord
    JOIN orders.transactions t ON t.order_id = ord.id
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'direction', ord.direction,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'spots_locked', ord.spots_locked,
         'items', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', l.id,
                       'kind', l.kind,
                       'source', l.source,
                       'metal_id', l.metal_id,
                       'metal', l.metal,
                       'content', l.content,
                       'quantity', l.quantity,
                       'premium', l.premium,
                       'retier_premium', l.retier_premium,
                       'unit_price', l.unit_price,
                       'line_total', l.line_total)
                     ORDER BY l.id ASC)
              FROM lined l),
           '[]'::jsonb),
         'unpriceable', COALESCE(
           (SELECT jsonb_agg(l.id ORDER BY l.id ASC)
              FROM lined l
             WHERE l.stored_price IS NULL AND l.bid IS NULL),
           '[]'::jsonb),
         'scrap_total', totals.scrap_total,
         'bullion_total', totals.bullion_total,
         'items_total', totals.scrap_total + totals.bullion_total,
         'shipping_charge', COALESCE(carriage.shipping_charge, 0),
         'payout_fee', COALESCE(payout.payout_fee, 0),
         'total', totals.scrap_total + totals.bullion_total
                  - COALESCE(carriage.shipping_charge, 0)
                  - COALESCE(payout.payout_fee, 0),
         'declared_value', totals.scrap_total + totals.bullion_total
       ) AS pricing
  FROM ord
 CROSS JOIN totals
  LEFT JOIN carriage ON TRUE
  LEFT JOIN payout ON TRUE
