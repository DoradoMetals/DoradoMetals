-- Sales orders past the TTL that the PAYMENT FACTS say were abandoned (D211
-- - no status drives this): money still owed (post_charges above zero, or no
-- money row at all), an intent that never settled and is not already
-- cancelled - cancellation IS the durable swept-fact, written by the sweep
-- itself - and no refund Credit logged. 'processing' is excluded because
-- ACH-style settlement legitimately takes days.
--
-- An order with NO intent and NO reserved funds re-lists until an admin
-- deals with it - there is no payment fact left to record a sweep on, and
-- inventing one is worse than a noisy report.
SELECT o.id AS order_id,
       o.user_id,
       t.used_funds,
       t.funds AS reserved_funds,
       pi.payment_intent_id,
       pi.payment_status
  FROM orders.orders o
  LEFT JOIN orders.transactions t ON t.order_id = o.id
  LEFT JOIN exchange.payment_intents pi ON pi.sales_order_id = o.id
 WHERE o.direction = 'sale'
   AND o.created_at < now() - make_interval(hours => $1)
   AND (t.post_charges_amount IS NULL OR t.post_charges_amount > 0)
   AND (pi.payment_intent_id IS NULL
        OR pi.payment_status NOT IN ('succeeded', 'processing', 'canceled'))
   AND NOT EXISTS (
         SELECT 1 FROM payments.ledger l
          WHERE l.order_id = o.id AND l.type = 'Credit'
       )
 ORDER BY o.created_at
