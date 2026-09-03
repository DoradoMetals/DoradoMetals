-- Both of a customer's sessions, one per direction.
SELECT id, user_id, direction, payment_method_id, payment_details_id,
       fulfillment_id, fulfillment_method_id, appointment_location_id,
       pickup_address_id, shipper_address_id, recipient_address_id,
       carrier_service_id, package_id, appointment_time,
       package_weight, declared_value, pickup_date, pickup_time FROM checkout.checkouts WHERE user_id = $1 ORDER BY direction
