SELECT s.id, s.carrier_service_id, s.package_id,
       s.recipient_address_id, s.shipper_address_id,
       s.tracking_number, s.delivered_at, s.shipped_at, s.est_delivery,
       s.label_type, s.direction::text AS direction,
       s.insured, s.additional_coverage, s.bill_return_to_customer,
       s.declared_value, s.cost, s.actual_cost,
       s.shipping_status, s.pickup_type, s.pickup_date, s.pickup_time, s.created_at
  FROM shipping.shipments s
 WHERE s.id = $1
