-- The full bank numbers of an order's LEGACY payout, resolved by order rather
-- than by id. Every rule on get_details.sql applies verbatim - admin only, one
-- at a time, never logged, never in an order payload.
--
-- WHY IT EXISTS. Since D213 the wire's `payout.id` is the payments.details id.
-- On a database built by 073 that is the same value as the old payout id, so
-- get_details.sql resolves and this is never reached. The dual era minted
-- details rows with fresh ids for orders that ALSO have an exchange payout -
-- 17 of dev's 33 - and for those the id lookup misses a row whose plaintext
-- exists. Walking the order finds it, so the admin's "view details" does not
-- 404 on a payout whose numbers are sitting right there.
SELECT id, user_id, order_id, method, account_holder_name, bank_name,
       account_type, routing_number, account_number, created_at, email_to, cost
  FROM exchange.payouts
 WHERE order_id = $1
 ORDER BY created_at DESC
 LIMIT 1
