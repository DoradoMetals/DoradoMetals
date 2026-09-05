INSERT INTO checkout.checkouts (user_id, direction)
VALUES ($1, $2)
ON CONFLICT (user_id, direction) DO NOTHING
RETURNING id, user_id, direction, payment_method_id, payment_details_id,
       recipient_address_id, fulfillment_id
