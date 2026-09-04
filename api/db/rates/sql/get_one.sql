-- One band, by id, in the admin shape - what create and update answer with.
SELECT r.id, m.name AS metal, r.unit, r.min_qty, r.max_qty,
       r.scrap_pct, r.bullion_pct, r.metal_id,
       r.created_at, r.updated_at, r.created_by, r.updated_by
  FROM rates.rates r
  JOIN metals.metals m ON m.id = r.metal_id
 WHERE r.id = $1
