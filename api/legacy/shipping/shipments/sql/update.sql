-- Mirror of sql/update.sql. `package` and `service_type` are TEXT here, which
-- is what the new schema turned into references - so this takes the names and
-- the other statement takes the ids the service resolved them to.
UPDATE exchange.shipments
   SET tracking_number = $1,
       shipping_status = $2,
       estimated_delivery = $3,
       shipped_at = $4,
       delivered_at = $5,
       shipping_label = $6,
       label_type = $7,
       pickup_type = $8,
       package = $9,
       service_type = $10,
       net_charge = $11,
       insured = $12,
       declared_value = $13,
       type = $14,
       carrier_id = $15
 WHERE id = $16
RETURNING id
