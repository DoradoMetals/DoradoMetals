-- LABEL REPAIR (D211): sales whose intent HAS settled - the payment fact -
-- but whose flair still says Pending. The status is read here only to find
-- labels that contradict the fact; nothing decides anything from it.
-- exchange.payment_intents is read because it is the authoritative payment
-- record while PAYMENTS_SOURCE is not promoted.
SELECT o.id AS order_id, pi.payment_intent_id
  FROM orders.orders o
  JOIN exchange.payment_intents pi ON pi.sales_order_id = o.id
 WHERE o.direction = 'sale'
   AND o.status = 'Pending'
   AND pi.payment_status = 'succeeded'
 ORDER BY o.created_at
