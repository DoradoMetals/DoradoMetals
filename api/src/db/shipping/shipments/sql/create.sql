INSERT INTO shipping.shipments (
  direction, tracking_number, shipping_status, label, label_type,
  pickup_type, package_id, carrier_service_id, cost, insured, declared_value
) VALUES (
  $1::shipping.direction, $2, $3, $4, $5, $6, $7, $8, $9,
  COALESCE($10, false), $11
)
RETURNING id
