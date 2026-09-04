-- Everything in one person's address book.
-- No ORDER BY: the sort key uses the ADDRESS's id, not this row's, so it happens in compose.ts once both halves are in hand.
SELECT id, address_id, user_id, recipient_name, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE user_id = $1
