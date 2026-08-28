-- One payout by its own id. Same last-four-only projection - see get_for.sql:
-- the full routing and account numbers never leave Postgres on this path.
SELECT id, user_id, order_id, method, account_holder_name, bank_name,
       account_type,
       right(account_number, 4) AS account_last4,
       right(routing_number, 4) AS routing_last4,
       email_to, cost, created_at
  FROM exchange.payouts
 WHERE id = $1
