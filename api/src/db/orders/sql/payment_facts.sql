-- What an order has been paid and refunded, as one expression over the
-- orders.orders row `o`. Substituted into view.sql and action_facts.sql
-- through /*__order_payment_facts__*/ so the cancel and refund actions and the
-- endpoints that refuse them read the same figures.
--
-- received   card settlements on the order's intents plus Received charge
--            transfers (a wire, an ACH pull, a manual mark).
-- refunded   Succeeded refunds.
-- refundable what a card refund may still return: card settlements less every
--            refund that has not Failed (a Pending refund holds its amount, so
--            a retry can never refund twice).
-- charge_received  a Received charge or a succeeded intent exists.
jsonb_build_object(
  'received',
    COALESCE((SELECT sum(st.settled_amount)
                FROM payments.intents pi
                JOIN payments.attempts pa ON pa.intent_id = pi.id
                JOIN payments.settlements st ON st.attempt_id = pa.id
               WHERE pi.order_id = o.id), 0)
    + COALESCE((SELECT sum(tr.amount)
                  FROM payments.transfers tr
                 WHERE tr.order_id = o.id AND tr.kind = 'charge'
                   AND tr.state = 'Received'), 0),
  'refunded',
    COALESCE((SELECT sum(r.amount) FROM payments.refunds r
               WHERE r.order_id = o.id AND r.state = 'Succeeded'), 0),
  'refundable',
    GREATEST(
      COALESCE((SELECT sum(st.settled_amount)
                  FROM payments.intents pi
                  JOIN payments.attempts pa ON pa.intent_id = pi.id
                  JOIN payments.settlements st ON st.attempt_id = pa.id
                 WHERE pi.order_id = o.id), 0)
      - COALESCE((SELECT sum(r.amount) FROM payments.refunds r
                   WHERE r.order_id = o.id AND r.state <> 'Failed'), 0),
      0),
  'charge_received',
    EXISTS (SELECT 1 FROM payments.transfers tr
             WHERE tr.order_id = o.id AND tr.kind = 'charge' AND tr.state = 'Received')
    OR EXISTS (SELECT 1 FROM payments.intents pi
                WHERE pi.order_id = o.id AND pi.status = 'succeeded')
)
