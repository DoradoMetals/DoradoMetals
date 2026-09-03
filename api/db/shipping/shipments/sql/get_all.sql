-- Every shipment's own row. No order link here - compose.ts walks fulfillments.shipments -> fulfillments.fulfillments -> orders.orders to find it.
-- carrier_service_id/package_id are projected for compose.ts to resolve to names, then dropped.
SELECT
       id, carrier_service_id, package_id,
       recipient_address_id, shipper_address_id,
       tracking_number, shipping_status, est_delivery, shipped_at, delivered_at,
       created_at, label, label_type, pickup_type, cost, insured,
       declared_value, direction::text AS direction
  FROM shipping.shipments
 ORDER BY id ASC
