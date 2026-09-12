-- Rate Sheet (Figma 129:752). One read, no parameters: every metal's
-- quantity bands and the whole-percent rate for each, bullion and scrap.
WITH band AS (
  SELECT r.metal_id, r.min_qty, r.max_qty, r.bullion_pct, r.scrap_pct,
         row_number() OVER (PARTITION BY r.metal_id ORDER BY r.min_qty) AS rn
    FROM rates.rates r
),
col AS (
  SELECT metal_id, rn,
         CASE WHEN max_qty IS NULL
              THEN trim(to_char(min_qty, 'FM999,999,990')) || '+ oz'
              ELSE trim(to_char(min_qty, 'FM999,999,990'))
                     || '–' || trim(to_char(max_qty, 'FM999,999,990')) || ' oz'
         END AS column_label,
         trim(to_char(round(bullion_pct * 100), 'FM990')) || '%' AS bullion_value,
         trim(to_char(round(scrap_pct * 100), 'FM990')) || '%' AS scrap_value
    FROM band
),
metal AS (
  SELECT metal_id,
         jsonb_agg(column_label ORDER BY rn) AS columns,
         jsonb_agg(bullion_value ORDER BY rn) AS bullion_values,
         jsonb_agg(scrap_value ORDER BY rn) AS scrap_values
    FROM col
   GROUP BY metal_id
)
SELECT jsonb_build_object(
         'issued', to_char(now() AT TIME ZONE 'America/Chicago', 'FMMonth YYYY'),
         'metals',
           COALESCE(
             (SELECT jsonb_agg(
                       jsonb_build_object(
                         'name', metal_id,
                         'columns', columns,
                         'rows', jsonb_build_array(
                                   jsonb_build_object('label', 'Bullion', 'values', bullion_values),
                                   jsonb_build_object('label', 'Scrap', 'values', scrap_values)
                                 )
                       )
                       ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], metal_id))
                FROM metal),
             '[]'::jsonb)
       ) AS content
