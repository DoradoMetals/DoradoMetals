-- A new row. The id is supplied by the service, not generated here, so that
-- both schemas end up with the same primary key.
INSERT INTO rates.rates
       (id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
        created_by, updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
          created_at, updated_at, created_by, updated_by
