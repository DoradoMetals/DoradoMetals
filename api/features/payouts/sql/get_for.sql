-- The payout on one order, with only the last four digits of the bank details.
--
-- ONLY THE LAST FOUR TRAVEL WITH AN ORDER, AND THAT IS THE MOST IMPORTANT LINE
-- IN THIS FILE. exchange.payouts holds routing and account numbers in
-- plaintext; the order response has never carried them and must not start.
-- `right(...)` happens IN THE STATEMENT rather than in JavaScript, so the full
-- value never leaves Postgres and cannot be logged by something in between.
--
-- STILL exchange. Payments has not been restructured - `payments.details` is
-- where these land eventually, and the encryption question has to be answered
-- before anything copies them there. This read moves when that happens.
SELECT id, user_id, order_id, method, account_holder_name, bank_name,
       account_type,
       right(account_number, 4) AS account_last4,
       right(routing_number, 4) AS routing_last4,
       email_to, cost, created_at
  FROM exchange.payouts
 WHERE order_id = $1
