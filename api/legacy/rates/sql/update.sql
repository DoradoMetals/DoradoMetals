-- Mirror of sql/update.sql against the schema still serving as record of truth.
UPDATE exchange.rates
   SET metal_id = $1,
       unit = $2,
       min_qty = $3,
       max_qty = $4,
       scrap_pct = $5,
       bullion_pct = $6,
       created_by = $7,
       updated_by = $8,
       updated_at = NOW()
 WHERE id = $9
RETURNING id
