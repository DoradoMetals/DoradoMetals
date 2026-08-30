-- Sales orders that have awaited payment longer than the TTL with an intent
-- that was never confirmed - or no intent at all. 'succeeded' is excluded
-- because that population belongs to the settled sweep, and 'processing' is
-- excluded because ACH-style settlement legitimately takes days and cancelling
-- mid-flight would abandon money already moving.
--
-- t.funds / t.used_funds is the credit reserved at creation
-- (orders.transactions, 073's mapping: pre_charges_amount -> funds) - what a
-- cancellation must put back.
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
   AND o.status = 'Pending'
   AND o.created_at < now() - make_interval(hours => $1)
   AND (pi.payment_intent_id IS NULL
        OR pi.payment_status NOT IN ('succeeded', 'processing'))
 ORDER BY o.created_at
