-- The sale whose card settled after placement and whose reserved credit has not
-- been resolved yet. Until ruling 112 this asked for `status = 'Pending'`; the
-- status is gone and the fact it stood for is the reservation still sitting on
-- the ledger as 'Reserve'.
SELECT o.id AS order_id, a.provider_ref AS payment_intent_id
  FROM orders.orders o
  JOIN payments.intents i ON i.order_id = o.id
  JOIN payments.attempts a ON a.intent_id = i.id
 WHERE o.direction = 'sale'
   AND o.cancelled_at IS NULL
   AND i.status = 'succeeded'
   AND EXISTS (SELECT 1 FROM payments.ledger l
                WHERE l.order_id = o.id AND l.type = 'Reserve')
 ORDER BY o.created_at
