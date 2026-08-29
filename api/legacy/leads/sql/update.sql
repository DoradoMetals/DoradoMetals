-- Mirror of sql/update.sql against the schema still serving as record of truth.
UPDATE exchange.leads
   SET name           = $1,
       phone          = $2,
       email          = $3,
       updated_at     = NOW(),
       updated_by     = $4,
       last_contacted = $5,
       converted      = $6,
       contacted      = $7,
       responded      = $8,
       contact        = $9,
       notes          = $10,
       priority       = $11
 WHERE id = $12
RETURNING id
