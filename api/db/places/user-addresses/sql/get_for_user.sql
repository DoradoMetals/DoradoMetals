-- Everything in one person's address book.
--
-- No ORDER BY: the caller's order is `default_shipping DESC, id ASC` where the
-- id is the ADDRESS's, not this row's, so the sort happens in compose.ts once
-- both halves are in hand.
SELECT id, address_id, user_id, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE user_id = $1
