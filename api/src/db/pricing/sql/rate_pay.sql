-- What each band pays per display unit of fine metal, from the metal's
-- resolved bid: bid x percentage x troy ounces in one unit. The unit factor is
-- leads.weight_units' grams over the troy ounce's, never a literal. A stale
-- metal still pays from its last good tick and says so in spot_state. `unit` is NULL when $1 names no weight unit. $2 narrows the
-- bands to one metal.
WITH unit AS (
  SELECT u.key, u.grams / t.grams AS troy_oz
    FROM leads.weight_units u
    JOIN leads.weight_units t ON t.key = 'troy_oz'
   WHERE u.key = $1
)
SELECT jsonb_build_object(
         'unit', (SELECT key FROM unit),
         'bands', COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', r.id,
                    'metal_id', r.metal_id,
                    'unit', r.unit,
                    'min_qty', r.min_qty,
                    'max_qty', r.max_qty,
                    'scrap_pct', r.scrap_pct,
                    'bullion_pct', r.bullion_pct,
                    'display_unit', u.key,
                    'spot_bid', s.bid,
                    'spot_state', COALESCE(s.state, 'stale'),
                    'spot_last_tick_at', s.last_tick_at,
                    'scrap_pay', s.bid * r.scrap_pct * u.troy_oz,
                    'bullion_pay', s.bid * r.bullion_pct * u.troy_oz)
                    ORDER BY m.sort_order, r.metal_id, r.min_qty, r.id)
             FROM rates.rates r
             JOIN metals.metals m ON m.id = r.metal_id
             CROSS JOIN unit u
             LEFT JOIN spots.resolved s ON s.metal_id = r.metal_id
            WHERE $2::text IS NULL OR r.metal_id = $2::text), '[]'::jsonb)) AS view
