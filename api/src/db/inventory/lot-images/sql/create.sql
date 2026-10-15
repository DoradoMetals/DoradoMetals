-- Link an image to a lot at the end of its set. Linking the same image twice
-- is a no-op that returns the existing link.
WITH next AS (
  SELECT COALESCE(max(sort_order) + 1, 0) AS sort_order
    FROM inventory.lot_images
   WHERE lot_id = $1
),
written AS (
  INSERT INTO inventory.lot_images (lot_id, image_id, sort_order)
  SELECT $1, $2, next.sort_order FROM next
  ON CONFLICT (lot_id, image_id) DO NOTHING
  RETURNING lot_id, image_id, sort_order, created_at, updated_at, created_by_id, updated_by_id
),
row AS (
  SELECT * FROM written
  UNION ALL
  SELECT li.lot_id, li.image_id, li.sort_order, li.created_at, li.updated_at,
         li.created_by_id, li.updated_by_id
    FROM inventory.lot_images li
   WHERE li.lot_id = $1 AND li.image_id = $2
     AND NOT EXISTS (SELECT 1 FROM written)
)
SELECT lot_id, image_id, sort_order,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM row
