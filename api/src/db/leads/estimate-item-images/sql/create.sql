-- Link an image to an estimate item at the end of its set. Linking the same
-- image twice is a no-op that returns the existing link.
WITH next AS (
  SELECT COALESCE(max(sort_order) + 1, 0) AS sort_order
    FROM leads.estimate_item_images
   WHERE estimate_item_id = $1
),
written AS (
  INSERT INTO leads.estimate_item_images (estimate_item_id, image_id, sort_order)
  SELECT $1, $2, next.sort_order FROM next
  ON CONFLICT (estimate_item_id, image_id) DO NOTHING
  RETURNING estimate_item_id, image_id, sort_order, created_at, updated_at,
            created_by_id, updated_by_id
),
row AS (
  SELECT * FROM written
  UNION ALL
  SELECT p.estimate_item_id, p.image_id, p.sort_order, p.created_at, p.updated_at,
         p.created_by_id, p.updated_by_id
    FROM leads.estimate_item_images p
   WHERE p.estimate_item_id = $1 AND p.image_id = $2
     AND NOT EXISTS (SELECT 1 FROM written)
)
SELECT estimate_item_id, image_id, sort_order,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM row
