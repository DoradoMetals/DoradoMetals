-- The payment FACTS for one provider reference, in the shape order creation
-- compares against (D211: every decision is a payment fact).
--
-- The amount is in CENTS here and in dollars everywhere else, deliberately:
-- the caller compares it against Math.round(dollars * 100), and an integer
-- comparison cannot drift the way a float one can.
--
-- One order_id + the order's own direction, not two nullable ids.
SELECT a.provider_ref AS payment_intent_id,
       i.id AS intent_id,
       a.id AS attempt_id,
       i.user_id,
       i.session_id,
       i.type,
       i.status AS payment_status,
       round(i.amount_expected * 100) AS amount,
       i.order_id,
       o.direction
  FROM payments.intents i
  JOIN payments.attempts a ON a.intent_id = i.id
  LEFT JOIN orders.orders o ON o.id = i.order_id
 WHERE a.provider_ref = $1
 ORDER BY i.created_at DESC, i.id
 LIMIT 1
