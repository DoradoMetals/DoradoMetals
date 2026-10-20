-- THE CREATE ORDER DRAWER'S ESTIMATE (rulings 158, 159).
--
-- Prices what the drawer holds before anything is written: the typed lot
-- inputs of a customer order ($3, a JSON array in drawer order), or the
-- selected on-hand lots of a Refiner Sale ($4). No row is read for update and
-- none is written.
--
-- A purchase prices at the live bid with the rate band for the metal's total
-- fine content, exactly as `order_pricing.sql` tiers a placed purchase; a sale
-- prices at the live ask with the product's ask premium. A premium the admin
-- typed (`premium` on a lot) replaces the rate on that line. A sale applies the
-- customer's balance as placement will (ruling 47).
--
-- $1 kind, $2 user_id (a customer order), $3 lots jsonb, $4 lot_ids uuid[].
WITH input AS (
  SELECT (e.ord - 1)::int AS position, e.lot
    FROM jsonb_array_elements(COALESCE($3::jsonb, '[]'::jsonb)) WITH ORDINALITY AS e(lot, ord)
   WHERE $1::text IN ('customer_purchase', 'customer_sale')
),
lines AS (
  SELECT i.position,
         NULL::uuid AS lot_id,
         b.id AS bullion_id,
         COALESCE(b.metal_id, i.lot->>'metal_id') AS metal_id,
         CASE WHEN b.id IS NOT NULL
              THEN COALESCE(b.content, 0) * COALESCE((i.lot->>'quantity')::numeric, 1)
              ELSE COALESCE(metals.fine_content((i.lot->>'pre_melt')::numeric,
                                                COALESCE(i.lot->>'unit', 't oz'),
                                                (i.lot->>'purity')::numeric), 0) END AS fine_oz,
         (i.lot->>'premium')::numeric AS override,
         b.ask_premium
    FROM input i
    LEFT JOIN products.bullion b ON b.id = (i.lot->>'bullion_id')::uuid
  UNION ALL
  SELECT (u.ord - 1)::int,
         li.id,
         li.bullion_id,
         li.metal_id,
         COALESCE(li.content, 0) * CASE WHEN li.bullion_id IS NULL THEN 1 ELSE li.quantity END,
         li.premium,
         NULL::numeric
    FROM unnest(COALESCE($4::uuid[], '{}'::uuid[])) WITH ORDINALITY AS u(id, ord)
    JOIN inventory.lots li ON li.id = u.id
   WHERE $1::text = 'refiner_sale'
),
by_metal AS (
  SELECT metal_id, sum(fine_oz) AS total FROM lines GROUP BY metal_id
),
priced AS (
  SELECT l.position,
         l.lot_id,
         l.metal_id,
         l.fine_oz,
         COALESCE(CASE WHEN $1::text = 'customer_sale' THEN s.ask ELSE s.bid END, 0) AS spot,
         COALESCE(l.override,
                  CASE WHEN $1::text = 'customer_sale' THEN l.ask_premium
                       WHEN l.bullion_id IS NULL THEN band.scrap_pct
                       ELSE band.bullion_pct END,
                  0) AS premium,
         s.last_tick_at
    FROM lines l
    LEFT JOIN spots.resolved s ON s.metal_id = l.metal_id
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
valued AS (
  SELECT p.*,
         round(p.fine_oz * p.spot, 2) AS metal_value,
         round(p.fine_oz * p.spot * p.premium, 2) AS total
    FROM priced p
),
summed AS (
  SELECT COALESCE(sum(v.metal_value), 0) AS metal_value,
         COALESCE(sum(v.total), 0) AS total
    FROM valued v
),
credit AS (
  SELECT CASE WHEN $1::text = 'customer_sale'
              THEN LEAST(GREATEST(COALESCE(u.dorado_funds, 0), 0), summed.total)
              ELSE 0 END AS applied
    FROM summed
    LEFT JOIN auth.users u ON u.id = $2::uuid
)
SELECT jsonb_build_object(
         'kind', $1::text,
         'spots_at', (SELECT to_char(max(v.last_tick_at) AT TIME ZONE 'UTC',
                                     'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM valued v),
         'spots', COALESCE((SELECT jsonb_agg(jsonb_build_object('metal_id', m.metal_id,
                                                                'spot', m.spot)
                                             ORDER BY m.metal_id)
                              FROM (SELECT DISTINCT v.metal_id, v.spot FROM valued v) m),
                           '[]'::jsonb),
         'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                     'position', v.position,
                                     'lot_id', v.lot_id,
                                     'metal_id', v.metal_id,
                                     'spot', v.spot,
                                     'fine_oz', v.fine_oz,
                                     'metal_value', v.metal_value,
                                     'premium', v.premium,
                                     'total', v.total)
                                   ORDER BY v.position)
                              FROM valued v),
                           '[]'::jsonb),
         'fine_oz', COALESCE((SELECT jsonb_agg(jsonb_build_object('metal_id', b.metal_id,
                                                                  'oz', b.total)
                                               ORDER BY b.metal_id)
                                FROM by_metal b),
                             '[]'::jsonb),
         'metal_value', summed.metal_value,
         'total', summed.total,
         'credit_applied', credit.applied,
         'total_due', summed.total - credit.applied
       ) AS preview
  FROM summed
 CROSS JOIN credit
