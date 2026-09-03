-- The payout on one order: the account it goes to, and the fee charged for it.
-- Only the last four travel with an order; full numbers live in payments.details envelopes or behind GET /payouts/:id/details, never here.
-- The fee is native: orders.transactions.payout_fee is the only place it's read from. The id is the details id, equal to the old payout id on any database built by migration 073.
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
