-- Mirror of sql/update.sql, plus the three columns exchange keeps on the pickup
-- itself. Same date/time handling as legacy/create.sql.
UPDATE exchange.carrier_pickups
   SET user_id = $2,
       order_id = $3,
       carrier = $7,
       pickup_requested_at =
  COALESCE(
    $4::timestamp,
    CASE WHEN $5::text IS NOT NULL
         THEN $5::date + COALESCE($6::time, '00:00'::time)
    END
  ),
       pickup_status = $8,
       confirmation_number = $9,
       location = $10
 WHERE id = $1
RETURNING id, pickup_requested_at
