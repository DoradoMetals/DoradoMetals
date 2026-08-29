-- The same row, written to the schema still serving as the record of truth.
-- The id is supplied so both schemas agree on it.
INSERT INTO exchange.rates
       (id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
        created_by, updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id
