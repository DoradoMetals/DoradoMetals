SELECT o.id AS order_id,
       o.user_id,
       t.used_funds,
       t.funds AS reserved_funds,
       a.provider_ref AS payment_intent_id,
       i.status AS payment_status
  FROM orders.orders o
  LEFT JOIN orders.transactions t ON t.order_id = o.id
  LEFT JOIN payments.intents i ON i.order_id = o.id
  LEFT JOIN payments.attempts a ON a.intent_id = i.id
 WHERE o.direction = 'sale'
   AND o.created_at < now() - make_interval(hours => $1)
   AND (t.post_charges_amount IS NULL OR t.post_charges_amount > 0)
   AND (a.provider_ref IS NULL
        OR i.status NOT IN ('succeeded', 'processing', 'canceled'))
   AND NOT EXISTS (
         SELECT 1 FROM payments.ledger l
          WHERE l.order_id = o.id AND l.type = 'Credit'
       )
 ORDER BY o.created_at
