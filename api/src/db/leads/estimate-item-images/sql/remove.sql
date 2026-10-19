-- Unlink an image from an estimate item. The image row and its file stay; only
-- the link goes.
DELETE FROM leads.estimate_item_images
 WHERE estimate_item_id = $1 AND image_id = $2
RETURNING estimate_item_id
