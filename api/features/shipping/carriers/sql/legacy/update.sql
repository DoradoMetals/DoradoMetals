-- Mirror of the two new-schema updates, which exchange does in one statement
-- because it holds both halves on one row.
UPDATE exchange.carriers
   SET name = $2, email = $3, phone = $4, logo = $5, is_active = $6,
       updated_at = NOW()
 WHERE id = $1
RETURNING id
