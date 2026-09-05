WITH checkout AS (
  SELECT c.id, c.payment_method_id
    FROM checkout.checkouts c
   WHERE c.id = $1::uuid
     AND c.direction = 'purchase'
),
lines AS (
  SELECT ci.id,
         ci.bullion_id,
         ci.metal_id,
         COALESCE(ci.content, 0) AS content,
         COALESCE(ci.quantity, 1) AS quantity,
         ci.premium AS stored_premium,
         s.bid AS bid,
         CASE WHEN ci.bullion_id IS NULL
              THEN COALESCE(ci.content, 0)
              ELSE COALESCE(ci.content, 0) * COALESCE(ci.quantity, 1) END AS weighed
    FROM checkout.items ci
    JOIN checkout ON checkout.id = ci.checkout_id
    LEFT JOIN spots.spots s ON s.metal_id = ci.metal_id
),
by_metal AS (
  SELECT metal_id, sum(weighed) AS total
    FROM lines
   WHERE metal_id IS NOT NULL
   GROUP BY metal_id
),
tiered AS (
  SELECT l.*,
         CASE WHEN l.bullion_id IS NULL THEN band.scrap_pct ELSE band.bullion_pct END AS band_pct
    FROM lines l
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
         t.metal_id,
         t.content,
         t.quantity,
         COALESCE(t.band_pct, t.stored_premium, 0) AS premium,
         t.content * (COALESCE(t.bid, 0) * COALESCE(t.band_pct, t.stored_premium, 0)) AS unit_price,
         t.bullion_id
    FROM tiered t
),
totals AS (
  SELECT COALESCE(sum(CASE WHEN p.bullion_id IS NULL THEN p.unit_price ELSE 0 END), 0)
           AS scrap_total,
         COALESCE(sum(CASE WHEN p.bullion_id IS NULL THEN 0
                           ELSE p.unit_price * p.quantity END), 0)
           AS bullion_total
    FROM priced p
),
charge AS (
  SELECT COALESCE(pm.flat_fee, 0) AS payout_charge
    FROM checkout
    LEFT JOIN payments.methods pm ON pm.id = checkout.payment_method_id
),
ceiling AS (
  SELECT COALESCE(min(sv.max_insured_value), 0) AS insured
    FROM shipping.services sv
   WHERE sv.carrier_id IS NOT NULL
)
SELECT jsonb_build_object(
         'direction', 'purchase',
         'checkout_id', checkout.id,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'items', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', p.id,
                       'kind', p.kind,
                       'metal_id', p.metal_id,
                       'content', p.content,
                       'quantity', p.quantity,
                       'premium', p.premium,
                       'unit_price', p.unit_price,
                       'line_total', CASE WHEN p.bullion_id IS NULL
                                          THEN p.unit_price
                                          ELSE p.unit_price * p.quantity END)
                     ORDER BY p.id ASC)
              FROM priced p),
           '[]'::jsonb),
         'scrap_total', totals.scrap_total,
         'bullion_total', totals.bullion_total,
         'total', totals.scrap_total + totals.bullion_total,
         'shipping_charge', 0,
         'payout_charge', charge.payout_charge,
         'declared_value',
           LEAST(totals.scrap_total + totals.bullion_total, ceiling.insured),
         'estimated_payout',
           GREATEST(0, totals.scrap_total + totals.bullion_total - charge.payout_charge)
       ) AS quote
  FROM checkout, totals, charge, ceiling
