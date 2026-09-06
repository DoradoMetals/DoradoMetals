-- The parcel's owner, which is what 137's composite key checks its addresses
-- against. Written before an address is, so the key has somebody to hold the
-- write to; a NULL user_id satisfies the key whatever the address column says.
UPDATE shipping.shipments
   SET user_id = $2
 WHERE id = $1
RETURNING id
