-- One row, by id.
--
-- Columns are listed rather than selected with *: rates.rates carries
-- created_by_id, updated_by_id, which exchange.rates has no equivalent for, and
-- they must not reach the wire while both schemas are serving
SELECT id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
       created_at, updated_at, created_by, updated_by
  FROM rates.rates
 WHERE id = $1
