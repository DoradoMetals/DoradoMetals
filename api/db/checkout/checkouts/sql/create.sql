-- A checkout session, which STARTS BARE. Jacob: "adding something to the cart
-- as a checkout session... the other values being null. They just can't be
-- null when the checkout session is converted to an order." That last part is
-- a rule for the conversion, not a constraint here.
--
-- DO NOTHING rather than raise: two requests can arrive together for a
-- customer who has never checked out, and losing that race is not an error.
-- The caller re-reads and gets the winner's row.
INSERT INTO checkout.checkouts (user_id, direction)
VALUES ($1, $2)
ON CONFLICT (user_id, direction) DO NOTHING
RETURNING id, user_id, direction, payment_method_id, payment_details_id,
       fulfillment_id, fulfillment_method_id, appointment_location_id,
       pickup_address_id, shipper_address_id, recipient_address_id,
       carrier_service_id, package_id, appointment_time,
       package_weight, declared_value, pickup_date, pickup_time
