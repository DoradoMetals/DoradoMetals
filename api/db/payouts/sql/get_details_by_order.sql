-- Full bank numbers of an order's legacy payout, by order rather than id. Same rules as get_details.sql - admin only, never logged, never in an order payload.
-- Exists because dual-era details rows got fresh ids for orders that also have an exchange payout - the id lookup misses those rows; walking the order finds them.
SELECT id, user_id, order_id, method, account_holder_name, bank_name,
       account_type, routing_number, account_number, created_at, email_to, cost
  FROM exchange.payouts
 WHERE order_id = $1
 ORDER BY created_at DESC
 LIMIT 1
