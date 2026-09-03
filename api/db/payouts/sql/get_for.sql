-- The payout on one order: the account it goes to, and the fee charged for it.
--
-- NATIVE SINCE D213. This read used to be `FROM exchange.payouts`, and that
-- became wrong the moment D210 sealed new accounts into payments.details and
-- D212 stopped exchange receiving payout writes: an order created after the
-- purge has no exchange row, so this answered nothing and the composed order
-- served an all-null payout with the fee dropped to 0. 114 carries the two
-- last-four values across so this projection loses nothing in the move.
--
-- ONLY THE LAST FOUR TRAVEL WITH AN ORDER, AND THAT IS STILL THE MOST
-- IMPORTANT LINE IN THIS FILE. The change of table does not relax it: the full
-- numbers are not columns of this statement, payments.details holds them only
-- as AES-256-GCM envelopes (104), and the plaintext that still exists lives in
-- exchange.payouts behind the one door that is allowed to open it,
-- GET /payouts/:id/details.
--
-- THE FEE IS THE NATIVE RECORD (D212): admin edits land on
-- orders.transactions.payout_fee, which is now the only place it is read from.
-- The id is the DETAILS id - what the admin details endpoint opens, and equal
-- to the old payout id on any database built by 073, which gave each row the
-- payout's own id.
SELECT d.id,
       d.user_id,
       t.order_id,
       m.type AS method,
       d.account_holder AS account_holder_name,
       d.bank_name,
       d.account_type,
       d.last_four AS account_last4,
       d.routing_last_four AS routing_last4,
       d.email_to,
       t.payout_fee AS cost,
       d.created_at
  FROM orders.transactions t
  JOIN payments.details d ON d.id = t.payout_details_id
  LEFT JOIN payments.methods m ON m.id = d.method_id
 WHERE t.order_id = $1
