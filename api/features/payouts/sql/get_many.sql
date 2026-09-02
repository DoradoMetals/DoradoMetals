-- The payouts of several orders at once. Same native composition and the same
-- last-four-only projection - see get_for.sql, which carries the reasoning.
-- This is the one the composed order read batches through, so it is the
-- statement that decides whether an order shows its payout at all.
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
 WHERE t.order_id = ANY($1::uuid[])
