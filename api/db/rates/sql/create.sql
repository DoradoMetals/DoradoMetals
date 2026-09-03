-- A new row. An explicit id wins; NULL generates one.
INSERT INTO rates.rates
       (id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
        created_by, updated_by)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
          created_at, updated_at, created_by, updated_by
