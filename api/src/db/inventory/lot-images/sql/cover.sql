-- Make an image the lot's cover: it is linked at sort_order 0, and every other
-- image of the lot moves back one place so the order stays a sequence. An image
-- already at 0 moves nothing. Runs in the caller's transaction, beside the write
-- to inventory.lots.image_id.
WITH shifted AS (
  UPDATE inventory.lot_images
     SET sort_order = sort_order + 1
   WHERE lot_id = $1 AND image_id <> $2
     AND NOT EXISTS (SELECT 1 FROM inventory.lot_images c
                      WHERE c.lot_id = $1 AND c.image_id = $2 AND c.sort_order = 0)
  RETURNING lot_id
)
INSERT INTO inventory.lot_images (lot_id, image_id, sort_order)
VALUES ($1, $2, 0)
ON CONFLICT (lot_id, image_id) DO UPDATE SET sort_order = 0
RETURNING lot_id, image_id, sort_order,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
