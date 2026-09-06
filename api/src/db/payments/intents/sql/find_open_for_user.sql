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
 WHERE i.user_id = $1
   AND i.status <> 'canceled'
 ORDER BY (i.order_id IS NULL) DESC, i.created_at DESC, i.id, a.created_at DESC, a.id
 LIMIT 1
