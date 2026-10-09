-- WHAT A LEAD'S ESTIMATE IS WORTH RIGHT NOW. $1 = lead id.
--
-- Nothing here is stored (rulings 34/41): the item rows carry weight, unit,
-- metal and purity, and the money is derived at read time from the live spot
-- and the rates band - the same ladder purchase_quote.sql uses for a real
-- purchase, so an estimate and the eventual order speak the same language.
--
-- Fine content is weight -> grams -> troy ounces -> times the fineness. The
-- troy-ounce factor is NOT a literal: it is the grams column of the troy_oz
-- row in leads.weight_units, so one table defines every unit including that
-- one.
--
-- No lead, no row: the repo answers undefined and pricing/rules refuses, so a
-- bad lead id is a 404 rather than a zero.
WITH troy AS (
  SELECT u.grams FROM leads.weight_units u WHERE u.key = 'troy_oz'
),
lead AS (
  SELECT l.id FROM leads.leads l WHERE l.id = $1::uuid
),
lines AS (
  SELECT i.id,
         k.key AS kind,
         i.metal_id,
         coalesce(p.purity, i.custom_purity) AS purity,
         i.weight * u.grams / troy.grams * coalesce(p.purity, i.custom_purity) AS content,
         s.bid AS bid
    FROM leads.estimate_items i
    JOIN lead ON lead.id = i.lead_id
    JOIN leads.estimate_kinds k ON k.id = i.kind_id
    JOIN leads.weight_units u ON u.id = i.unit_id
    CROSS JOIN troy
    LEFT JOIN metals.purity_labels p ON p.id = i.purity_id
    LEFT JOIN spots.spots s ON s.metal_id = i.metal_id
),
by_metal AS (
  SELECT l.metal_id, sum(l.content) AS total
    FROM lines l
   GROUP BY l.metal_id
),
tiered AS (
  SELECT l.*,
         CASE WHEN l.kind = 'bullion' THEN band.bullion_pct ELSE band.scrap_pct END AS band_pct
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
  SELECT t.id, t.kind, t.metal_id, t.purity, t.content, t.bid,
         coalesce(t.band_pct, 0) AS premium,
         t.content * (coalesce(t.bid, 0) * coalesce(t.band_pct, 0)) AS value
    FROM tiered t
)
SELECT jsonb_build_object(
         'lead_id', lead.id,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'items', coalesce(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', p.id,
                       'kind', p.kind,
                       'metal_id', p.metal_id,
                       'purity', p.purity,
                       'content', p.content,
                       'premium', p.premium,
                       'value', p.value)
                     ORDER BY p.id ASC)
              FROM priced p),
           '[]'::jsonb),
         'unpriceable', coalesce(
           (SELECT jsonb_agg(p.id ORDER BY p.id ASC) FROM priced p WHERE p.bid IS NULL),
           '[]'::jsonb),
         'total', (SELECT coalesce(sum(p.value), 0) FROM priced p)
       ) AS estimate
  FROM lead
