-- Rate Sheet (Figma 129:752). One read, no parameters: every metal's
-- quantity bands and the whole-percent rate for each, bullion and scrap.
WITH band AS (
  SELECT r.metal_id, r.min_qty, r.max_qty, r.bullion_pct, r.scrap_pct,
         row_number() OVER (PARTITION BY r.metal_id ORDER BY r.min_qty) AS rn
    FROM rates.rates r
),
metal AS (
  SELECT b.metal_id,
         mm.sort_order,
         jsonb_agg(jsonb_build_array(b.min_qty, b.max_qty) ORDER BY b.rn) AS bounds,
         jsonb_agg(b.bullion_pct ORDER BY b.rn) AS bullion_exact,
         jsonb_agg(b.scrap_pct ORDER BY b.rn) AS scrap_exact,
         jsonb_agg(CASE WHEN b.max_qty IS NULL
                        THEN trim(to_char(b.min_qty, 'FM999,999,990')) || '+ oz'
                        ELSE trim(to_char(b.min_qty, 'FM999,999,990'))
                               || '–' || trim(to_char(b.max_qty, 'FM999,999,990')) || ' oz'
                   END ORDER BY b.rn) AS columns,
         jsonb_agg(trim(to_char(round(b.bullion_pct * 100), 'FM990')) || '%' ORDER BY b.rn)
           AS bullion_values,
         jsonb_agg(trim(to_char(round(b.scrap_pct * 100), 'FM990')) || '%' ORDER BY b.rn)
           AS scrap_values
    FROM band b
    JOIN metals.metals mm ON mm.id = b.metal_id
   GROUP BY b.metal_id, mm.sort_order
),
shared AS (
  SELECT string_agg(metal_id, ' and ' ORDER BY sort_order) AS name,
         min(sort_order) AS place,
         min(columns::text)::jsonb AS columns,
         min(bullion_values::text)::jsonb AS bullion_values,
         min(scrap_values::text)::jsonb AS scrap_values
    FROM metal
   GROUP BY bounds, bullion_exact, scrap_exact
),
fee AS (
  SELECT m.label, concat_ws(' · ', m.surcharge_label, m.time_delay) AS value, m.sort_order
    FROM payments.methods m
   WHERE m.direction = 'purchase' AND m.enabled AND m.display
)
SELECT jsonb_build_object(
         'issued', to_char(now() AT TIME ZONE 'America/Chicago', 'FMMonth YYYY'),
         'metals',
           COALESCE(
             (SELECT jsonb_agg(
                       jsonb_build_object(
                         'name', name,
                         'columns', columns,
                         'rows', jsonb_build_array(
                                   jsonb_build_object('label', 'Bullion', 'values', bullion_values),
                                   jsonb_build_object('label', 'Scrap', 'values', scrap_values)
                                 )
                       )
                       ORDER BY place)
                FROM shared),
             '[]'::jsonb),
         'fees',
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value) ORDER BY sort_order)
                FROM fee),
             '[]'::jsonb)
       ) AS content
