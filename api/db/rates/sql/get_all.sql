-- The public bands: the metal's NAME in place of its id, no audit columns.
-- Ordered by metal then band, which is only possible because the name is
-- joined here rather than attached afterwards in JS.
SELECT r.id, m.name AS metal, r.unit, r.min_qty, r.max_qty,
       r.scrap_pct, r.bullion_pct
  FROM rates.rates r
  JOIN metals.metals m ON m.id = r.metal_id
 ORDER BY m.name ASC, r.min_qty ASC, r.id ASC
