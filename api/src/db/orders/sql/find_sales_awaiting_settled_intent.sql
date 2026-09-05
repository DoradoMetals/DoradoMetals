SELECT o.id AS order_id, a.provider_ref AS payment_intent_id
  FROM orders.orders o
  JOIN payments.intents i ON i.order_id = o.id
  JOIN payments.attempts a ON a.intent_id = i.id
 WHERE o.direction = 'sale'
   AND o.status = 'Pending'
   AND i.status = 'succeeded'
 ORDER BY o.created_at
