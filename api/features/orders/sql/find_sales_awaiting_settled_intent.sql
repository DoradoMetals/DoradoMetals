-- Sales orders still awaiting payment whose intent HAS succeeded - the
-- missed-webhook population (production has had three such intents, D191's
-- $126.48 thread). exchange.payment_intents is read because it is the
-- authoritative payment record while PAYMENTS_SOURCE=exchange.
SELECT o.id AS order_id, pi.payment_intent_id
  FROM orders.orders o
  JOIN exchange.payment_intents pi ON pi.sales_order_id = o.id
 WHERE o.direction = 'sale'
   AND o.status = 'Pending'
   AND pi.payment_status = 'succeeded'
 ORDER BY o.created_at
