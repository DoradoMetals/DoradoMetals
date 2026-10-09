INSERT INTO leads.estimate_items
       (lead_id, kind_id, metal_id, weight, unit_id, purity_id, custom_purity)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, lead_id, kind_id, metal_id, weight, unit_id, purity_id, custom_purity,
          created_at, updated_at, created_by_id, updated_by_id
