INSERT INTO shipping.shipments (
  id, direction, tracking_number, shipping_status, label, label_type,
  pickup_type, package_id, carrier_service_id, cost, insured, declared_value
) VALUES (
  $1, $2::shipping.direction, $3, $4, $5, $6, $7, $8, $9, $10,
  COALESCE($11, false), $12
)
RETURNING id
