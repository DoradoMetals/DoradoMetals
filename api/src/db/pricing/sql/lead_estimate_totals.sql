-- ARRAY IN, ARRAY OUT (ruling 34). $1 = uuid[] of lead ids.
--
-- One row per REQUESTED lead, so a lead with no estimate lines comes back as
-- a zero rather than as a gap the caller has to notice. The band is drawn per
-- lead and per metal, exactly as lead_estimate.sql draws it for one lead.
WITH troy AS (
  SELECT u.grams FROM leads.weight_units u WHERE u.key = 'troy_oz'
),
asked AS (
  SELECT DISTINCT a.lead_id FROM unnest($1::uuid[]) AS a(lead_id)
),
lines AS (
  SELECT i.id,
         i.lead_id,
         k.key AS kind,
         i.metal_id,
         i.weight * u.grams / troy.grams * coalesce(p.purity, i.custom_purity) AS content,
         s.bid AS bid
    FROM leads.estimate_items i
    JOIN asked ON asked.lead_id = i.lead_id
    JOIN leads.estimate_kinds k ON k.id = i.kind_id
    JOIN leads.weight_units u ON u.id = i.unit_id
    CROSS JOIN troy
    LEFT JOIN metals.purity_labels p ON p.id = i.purity_id
    LEFT JOIN spots.spots s ON s.metal_id = i.metal_id
),
by_metal AS (
  SELECT l.lead_id, l.metal_id, sum(l.content) AS total
    FROM lines l
   GROUP BY l.lead_id, l.metal_id
),
tiered AS (
  SELECT l.*,
         CASE WHEN l.kind = 'bullion' THEN band.bullion_pct ELSE band.scrap_pct END AS band_pct
    FROM lines l
    LEFT JOIN by_metal t ON t.lead_id = l.lead_id AND t.metal_id = l.metal_id
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
)
SELECT asked.lead_id,
       coalesce(sum(t.content * (coalesce(t.bid, 0) * coalesce(t.band_pct, 0))), 0) AS total
  FROM asked
  LEFT JOIN tiered t ON t.lead_id = asked.lead_id
 GROUP BY asked.lead_id
 ORDER BY asked.lead_id
