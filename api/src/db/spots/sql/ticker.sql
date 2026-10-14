-- The public spots bar: one row per metal in metal order. Price is the
-- resolved bid, so adjustments and freezes apply; nothing admin-only.
SELECT r.metal_id,
       r.bid AS price,
       r.percent_change,
       CASE WHEN COALESCE(r.dollar_change, 0) = 0 THEN 'flat'
            WHEN r.dollar_change > 0 THEN 'up'
            ELSE 'down' END AS direction,
       r.updated_at AS at
  FROM spots.resolved r
  JOIN metals.metals m ON m.id = r.metal_id
 ORDER BY m.sort_order ASC, r.metal_id ASC
