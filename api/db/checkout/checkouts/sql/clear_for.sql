-- Placing an order empties the basket's choices. Naming the four writable
-- columns here is the whole point: they are the table's, so the "clear" is one
-- statement rather than an all-null patch assembled from PATCHABLE in
-- TypeScript (ruling 78). A user with no basket in this direction updates
-- nothing, which is what the caller's early return did.
UPDATE checkout.checkouts
   SET payment_method_id = NULL,
       recipient_address_id = NULL,
       payment_details_id = NULL,
       fulfillment_id = NULL
 WHERE user_id = $1
   AND direction = $2
RETURNING id
