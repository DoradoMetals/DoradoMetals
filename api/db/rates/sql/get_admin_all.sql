-- The admin bands: the public shape plus metal_id and the audit columns.
-- created_by_id/updated_by_id are not projected - they never reach the wire.
SELECT r.id, m.name AS metal, r.unit, r.min_qty, r.max_qty,
       r.scrap_pct, r.bullion_pct, r.metal_id,
       r.created_at, r.updated_at, r.created_by, r.updated_by
  FROM rates.rates r
  JOIN metals.metals m ON m.id = r.metal_id
 ORDER BY m.name ASC, r.min_qty ASC, r.id ASC
