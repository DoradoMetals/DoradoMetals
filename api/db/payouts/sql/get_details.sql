-- THE ONE READ WITH FULL BANK NUMBERS: GET /payouts/:id/details, admin only, one payout at a time. Every other projection in this feature is last-4 only.
-- Verbatim exchange.payouts row, keyed by the payout's own id (the order wire's order.payout.id).
SELECT id, user_id, order_id, method, account_holder_name, bank_name,
       account_type, routing_number, account_number, created_at, email_to, cost
  FROM exchange.payouts
 WHERE id = $1
