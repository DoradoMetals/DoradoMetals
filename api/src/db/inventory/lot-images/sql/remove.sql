-- Unlink an image from a lot. The image row and its file stay; only the link
-- goes.
DELETE FROM inventory.lot_images WHERE lot_id = $1 AND image_id = $2 RETURNING lot_id
