-- The customer's session for one direction. (user_id, direction) is the
-- natural key - 068 added the unique index - so at most one row.
SELECT id, user_id, direction, payment_method_id, payment_details_id,
       fulfillment_id, fulfillment_method_id, appointment_location_id,
       pickup_address_id, shipper_address_id, recipient_address_id,
       carrier_service_id, package_id, appointment_time,
       pickup_date, pickup_time
  FROM checkout.checkouts
 WHERE user_id = $1 AND direction = $2
