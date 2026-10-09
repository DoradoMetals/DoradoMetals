-- Scoped by lead as well as id: the lead in the URL owns the item, so an item
-- id from another lead's estimate is simply not found here (ruling 64).
SELECT id, lead_id, kind_id, metal_id, weight, unit_id, purity_id, custom_purity,
       created_at, updated_at, created_by_id, updated_by_id
  FROM leads.estimate_items
 WHERE id = $2 AND lead_id = $1
