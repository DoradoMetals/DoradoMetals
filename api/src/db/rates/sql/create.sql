INSERT INTO rates.rates
       (metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
