-- A lead's estimate items, oldest first, each with the number of photos
-- linked to it in leads.estimate_item_images (ruling 137), its weight in
-- grams (weight x the unit's grams) and the whole estimate's weight in grams,
-- the same on every row, so the screen formats and never converts.
SELECT i.id, i.lead_id, i.kind_id, i.metal_id, i.weight, i.unit_id, i.purity_id, i.custom_purity,
       i.created_at, i.updated_at, i.created_by_id, i.updated_by_id,
       (SELECT count(*)::int
          FROM leads.estimate_item_images p
         WHERE p.estimate_item_id = i.id) AS image_count,
       i.weight * u.grams AS grams,
       sum(i.weight * u.grams) OVER () AS total_grams
  FROM leads.estimate_items i
  JOIN leads.weight_units u ON u.id = i.unit_id
 WHERE i.lead_id = $1
 ORDER BY i.created_at ASC, i.id ASC
