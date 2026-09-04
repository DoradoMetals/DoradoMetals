SELECT r.id, m.name AS metal, r.unit, r.min_qty, r.max_qty,
       r.scrap_pct, r.bullion_pct
  FROM rates.rates r
  JOIN metals.metals m ON m.id = r.metal_id
 ORDER BY m.name ASC, r.min_qty ASC, r.id ASC
