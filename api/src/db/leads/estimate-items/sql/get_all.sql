SELECT id, lead_id, kind_id, metal_id, weight, unit_id, purity_id, custom_purity,
       created_at, updated_at, created_by_id, updated_by_id
  FROM leads.estimate_items
 WHERE lead_id = $1
 ORDER BY created_at ASC, id ASC
