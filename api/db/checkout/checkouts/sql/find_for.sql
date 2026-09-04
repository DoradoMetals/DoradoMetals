-- The customer's session for one direction. (user_id, direction) is the
-- natural key - 068 added the unique index - so at most one row.
SELECT id, user_id, direction, payment_method_id, payment_details_id,
       recipient_address_id, fulfillment_id
  FROM checkout.checkouts
 WHERE user_id = $1 AND direction = $2
