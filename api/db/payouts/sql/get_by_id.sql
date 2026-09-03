-- One payout account by its own id - what PATCH /api/payouts/:id resolves
-- before dispatching its order-keyed writes. Same native composition and the
-- same last-four-only projection as get_for.sql.
--
-- THE JOIN TO orders.transactions IS LEFT, DELIBERATELY. A payments.details
-- row need not pay an order - 078 derives rows from a payer's card - and the
-- caller distinguishes "no such account" (404) from "attached to no order"
-- (422). An INNER join would collapse those two into the same answer.
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
  FROM payments.details d
  LEFT JOIN orders.transactions t ON t.payout_details_id = d.id
  LEFT JOIN payments.methods m ON m.id = d.method_id
 WHERE d.id = $1
