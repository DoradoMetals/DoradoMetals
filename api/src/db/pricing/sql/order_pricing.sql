WITH ord AS (
  SELECT o.id, o.direction, COALESCE(o.spots_locked, false) AS spots_locked
    FROM orders.orders o
   WHERE o.id = $1::uuid
),
lines AS (
  SELECT ol.id,
         li.bullion_id,
         li.metal_id,
         COALESCE(li.content, 0) AS content,
         li.quantity,
         li.premium AS stored_premium,
         -- PRICE IS NEVER STORED (ruling 120). Every line prices off the
         -- order's own frozen spot for that metal - bid for a purchase, ask
         -- for a sale - falling back to the live feed while the order has not
         -- frozen one yet.
         CASE WHEN ord.direction = 'sale'
              THEN CASE WHEN ord.spots_locked THEN COALESCE(os.ask, s.ask) ELSE s.ask END
              ELSE CASE WHEN ord.spots_locked THEN COALESCE(os.bid, s.bid) ELSE s.bid END END AS spot,
         CASE WHEN li.bullion_id IS NULL
              THEN COALESCE(li.content, 0)
              ELSE COALESCE(li.content, 0) * li.quantity END AS weighed
    FROM orders.lots ol
    JOIN inventory.lots li ON li.id = ol.lot_id
    JOIN ord ON ord.id = ol.order_id
    LEFT JOIN orders.spots os ON os.order_id = ol.order_id AND os.metal_id = li.metal_id
    LEFT JOIN spots.spots s ON s.metal_id = li.metal_id
),
-- The bid and ask each of the order's metals is priced at, resolved exactly as
-- `lines` resolves a line's spot: the frozen orders.spots row when the order is
-- locked, the live feed when it is not. A metal appears only when the order has
-- a lot in it, so a document prints the order's metals and no others.
metal_spots AS (
  SELECT DISTINCT ON (li.metal_id)
         li.metal_id,
         CASE WHEN ord.spots_locked THEN COALESCE(os.bid, s.bid) ELSE s.bid END AS bid,
         CASE WHEN ord.spots_locked THEN COALESCE(os.ask, s.ask) ELSE s.ask END AS ask
    FROM orders.lots ol
    JOIN inventory.lots li ON li.id = ol.lot_id
   CROSS JOIN ord
    LEFT JOIN orders.spots os ON os.order_id = ol.order_id AND os.metal_id = li.metal_id
    LEFT JOIN spots.spots s ON s.metal_id = li.metal_id
   WHERE ol.order_id = ord.id
   ORDER BY li.metal_id, ol.id
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
         -- Price is always quoted, never stored - there is no other source
         -- left to distinguish here.
         t.bullion_id,
         t.metal_id,
         t.content,
         t.quantity,
         COALESCE(t.stored_premium, t.retier_premium, 0) AS premium,
         t.retier_premium,
         t.spot,
         t.content * (COALESCE(t.spot, 0) * COALESCE(t.stored_premium, t.retier_premium, 0)) AS unit_price
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
                       'metal_id', l.metal_id,
                       'content', l.content,
                       'quantity', l.quantity,
                       'premium', l.premium,
                       'retier_premium', l.retier_premium,
                       'unit_price', l.unit_price,
                       'line_total', l.line_total)
                     ORDER BY l.id ASC)
              FROM lined l),
           '[]'::jsonb),
         'spots', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'metal_id', ms.metal_id, 'bid', ms.bid, 'ask', ms.ask)
                     ORDER BY array_position(
                                ARRAY['Gold','Silver','Platinum','Palladium'],
                                ms.metal_id) NULLS LAST,
                              ms.metal_id ASC)
              FROM metal_spots ms),
           '[]'::jsonb),
         'unpriceable', COALESCE(
           (SELECT jsonb_agg(l.id ORDER BY l.id ASC)
              FROM lined l
             WHERE l.spot IS NULL),
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
