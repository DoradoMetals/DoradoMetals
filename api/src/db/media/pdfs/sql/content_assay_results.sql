-- Assay Results (Figma 225:2270). One read: a purchase order's per-lot
-- measurements. No money on any line - rules.isFinalized gates access
-- before this runs. Never reads orders.items, which is frozen legacy.
WITH ord AS (
  SELECT o.id, o.number
    FROM orders.orders o
   WHERE o.id = $1
     AND o.direction = 'purchase'
),
lot AS (
  SELECT i.id,
         i.metal_id,
         i.purity,
         i.content * i.quantity AS fine,
         metals.fine_content(COALESCE(i.post_melt, i.pre_melt), i.unit, 1) AS gross_troy_oz,
         COALESCE(b.name, i.metal_id || ' scrap') AS name
    FROM ord
    JOIN orders.lots ol ON ol.order_id = ord.id
    JOIN inventory.lots i ON i.id = ol.lot_id
    LEFT JOIN products.bullion b ON b.id = i.bullion_id
),
labeled AS (
  SELECT lot.*, lbl.label
    FROM lot
    LEFT JOIN LATERAL (
      SELECT p.label
        FROM metals.purity_labels p
       WHERE p.metal_id = lot.metal_id
         AND abs(p.purity - lot.purity) <= p.tolerance
       ORDER BY abs(p.purity - lot.purity)
       LIMIT 1
    ) lbl ON lot.purity IS NOT NULL
),
built AS (
  SELECT l.id,
         l.name,
         CASE WHEN l.fine IS NULL THEN '-'
              ELSE trim(to_char(l.fine, 'FM999,999,990.000')) || ' t oz'
         END AS figure,
         (SELECT COALESCE(jsonb_agg(f ORDER BY ord), '[]'::jsonb)
            FROM unnest(ARRAY[
                   CASE WHEN l.gross_troy_oz IS NULL THEN NULL ELSE
                     trim(to_char(l.gross_troy_oz * 31.1034768, 'FM999,999,990.0')) || ' g · '
                     || trim(to_char(l.gross_troy_oz * 20, 'FM999,999,990.0')) || ' dwt · '
                     || trim(to_char(l.gross_troy_oz, 'FM999,999,990.000')) || ' t oz gross'
                   END,
                   CASE WHEN l.purity IS NULL THEN NULL ELSE
                     trim(to_char(l.purity * 100, 'FM990.0')) || '% purity'
                   END,
                   l.label,
                   CASE WHEN l.fine IS NULL THEN NULL ELSE
                     trim(to_char(l.fine * 31.1034768, 'FM999,999,990.0')) || ' g · '
                     || trim(to_char(l.fine * 20, 'FM999,999,990.0')) || ' dwt fine'
                   END
                 ]) WITH ORDINALITY AS t(f, ord)
           WHERE f IS NOT NULL) AS facts
    FROM labeled l
),
by_metal AS (
  SELECT metal_id AS label,
         trim(to_char(COALESCE(SUM(fine), 0), 'FM999,999,990.000')) || ' t oz' AS value
    FROM lot
   GROUP BY metal_id
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'reference', 'PO-' || ord.number,
         'total_fine',
           trim(to_char(COALESCE((SELECT SUM(fine) FROM lot), 0), 'FM999,999,990.000')) || ' t oz',
         'lots',
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('name', name, 'figure', figure, 'facts', facts))
                FROM built),
             '[]'::jsonb),
         'by_metal',
           COALESCE(
             (SELECT jsonb_agg(
                       jsonb_build_object('label', label, 'value', value)
                       ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], label))
                FROM by_metal),
             '[]'::jsonb)
       ) AS content
  FROM ord
