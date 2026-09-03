-- Everything the carrier told us, once the label exists.
--
-- carrier_service_id and package_id are IDS here. exchange stores the service
-- and the package as TEXT on the shipment row; the service resolves both
-- before this runs, and says which one it could not find rather than writing a
-- null into a column that means "no service".
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
       insured = $12,
       declared_value = $13,
       direction = $14::shipping.direction
 WHERE id = $15
RETURNING id
