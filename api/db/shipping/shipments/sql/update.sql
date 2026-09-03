-- Everything the carrier told us, once the label exists.
-- carrier_service_id/package_id are ids - the caller resolves them first and reports what it could not find, rather than writing NULL.
UPDATE shipping.shipments
   SET tracking_number = $1,
       shipping_status = $2,
       est_delivery = $3,
       shipped_at = $4,
       delivered_at = $5,
       label = $6,
       label_type = $7,
       pickup_type = $8,
       package_id = $9,
       carrier_service_id = $10,
       cost = $11,
       insured = COALESCE($12, false),
       declared_value = $13,
       direction = $14::shipping.direction
 WHERE id = $15
RETURNING id
