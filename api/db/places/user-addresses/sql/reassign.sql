-- THE VISITOR'S ADDRESS BOOK CHANGES HANDS (ruling 63). Only the LINK moves:
-- places.addresses rows are shared between users by design (this table is the
-- join, and addresses/sql/is_referenced.sql exists because of it), so the
-- address itself is never re-keyed.
--
-- ON CONFLICT DO NOTHING would be wrong here and there is no unique index to
-- trip: a customer who already has the same address in their book ends up with
-- two links to it, which is a duplicate row in a list, not a lost one. The
-- alternative - dropping the visitor's link - would silently lose the DEFAULT
-- flags the visitor set during checkout.
UPDATE places.user_addresses
   SET user_id = $2
 WHERE user_id = $1
