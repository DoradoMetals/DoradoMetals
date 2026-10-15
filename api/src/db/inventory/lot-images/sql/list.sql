-- A lot's images, in the order the photo viewer draws them (ruling 137). The
-- lot's cover, inventory.lots.image_id, comes first; the rest follow by
-- sort_order.
SELECT li.image_id, li.sort_order
  FROM inventory.lot_images li
  JOIN inventory.lots l ON l.id = li.lot_id
 WHERE li.lot_id = $1
 ORDER BY (li.image_id IS NOT DISTINCT FROM l.image_id) DESC, li.sort_order, li.created_at,
          li.image_id
