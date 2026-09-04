-- WHOSE CHECKOUT A DRAFT FULFILLMENT BELONGS TO. A fulfillment carries no user
-- of its own and a draft has no order either, so this row is the only answer
-- to "is this yours" while the customer is still deciding.
-- checkouts_fulfillment_idx (111) is the partial index this seeks through.
SELECT id, user_id, direction, payment_method_id, payment_details_id,
       recipient_address_id, fulfillment_id
  FROM checkout.checkouts
 WHERE fulfillment_id = $1
