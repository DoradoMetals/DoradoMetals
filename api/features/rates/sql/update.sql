-- Every caller-supplied field.
--
-- updated_at is maintained here. Forty-two of the fifty-two UPDATE statements
-- against exchange do not maintain theirs, which is why a drifted row cannot be
-- spotted from its timestamp.
UPDATE rates.rates
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
RETURNING id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
          created_at, updated_at, created_by, updated_by
