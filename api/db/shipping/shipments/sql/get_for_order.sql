-- Every shipment on one order, both directions, in one array (not two named slots - an order can have two outbound parcels). No order id on this table; resolved via fulfillments.shipments/fulfillments in the WHERE clause.
-- label is encode(...,'base64') - the driver's raw Buffer JSON runs far larger (measured: half a megabyte vs 13KB across 23 rows).
SELECT s.id, s.carrier_service_id, s.package_id,
       s.recipient_address_id, s.shipper_address_id,
       s.tracking_number, s.delivered_at, s.shipped_at, s.est_delivery,
       s.label_type, encode(s.label, 'base64') AS label,
       s.direction::text AS direction,
       s.insured, s.declared_value, s.cost, s.actual_cost,
       s.shipping_status, s.pickup_type, s.created_at
  FROM shipping.shipments s
  JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
 WHERE f.order_id = $1
 ORDER BY s.created_at ASC, s.id ASC
