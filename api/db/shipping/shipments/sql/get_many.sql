-- Several shipments by id, for composing a list without a query per row.
SELECT
       id, carrier_service_id, package_id,
       recipient_address_id, shipper_address_id,
       tracking_number, shipping_status, est_delivery, shipped_at, delivered_at,
       created_at, label, label_type, pickup_type, cost, insured,
       declared_value, actual_cost, pickup_date, pickup_time,
       direction::text AS direction
  FROM shipping.shipments
 WHERE id = ANY($1::uuid[])
