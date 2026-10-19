-- An estimate item's photos, in the order the photo viewer draws them
-- (ruling 137).
SELECT image_id, sort_order
  FROM leads.estimate_item_images
 WHERE estimate_item_id = $1
 ORDER BY sort_order, created_at, image_id
