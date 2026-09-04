-- One parcel, as a READ serves it: every column of shipping.shipments except
-- the label itself. The label is bytea and the driver's raw JSON runs far
-- larger than the row around it (measured: half a megabyte against 13KB across
-- 23 rows); it is served by the document endpoint, never inside a view.
-- `direction` casts to text - the wire has always carried a string.
SELECT s.id, s.carrier_service_id, s.package_id,
       s.recipient_address_id, s.shipper_address_id,
       s.tracking_number, s.delivered_at, s.shipped_at, s.est_delivery,
       s.label_type, s.direction::text AS direction,
       s.insured, s.declared_value, s.cost, s.actual_cost,
       s.shipping_status, s.pickup_type, s.created_at
  FROM shipping.shipments s
 WHERE s.id = $1
