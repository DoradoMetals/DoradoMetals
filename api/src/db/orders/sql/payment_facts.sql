-- What an order has been paid and refunded, as one expression over the
-- orders.orders row `o`. Substituted into view.sql and action_facts.sql
-- through /*__order_payment_facts__*/ so the cancel and refund actions and the
-- endpoints that refuse them read the same figures.
--
-- received   card settlements on the order's intents, Received charge
--            transfers (a wire, an ACH pull, a manual mark) and the credit
--            the order debited from the customer's balance.
-- refunded   Succeeded card refunds plus credit given back to the balance.
-- refundable what a card refund may still return: the settlements of the
--            newest succeeded Stripe intent (the one refunds/source_for.sql
--            refunds through) less every refund against that intent that has
--            not Failed (a Pending refund holds its amount, so a retry can
--            never refund twice).
-- credit     credit debited for the order and not yet given back; a sale
--            cancel returns it to the balance itself (ruling 133).
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
                   AND tr.state = 'Received'), 0)
    + COALESCE((SELECT sum(l.amount) FROM payments.ledger l
                 WHERE l.order_id = o.id AND l.type = 'Debit'), 0),
  'refunded',
    COALESCE((SELECT sum(r.amount) FROM payments.refunds r
               WHERE r.order_id = o.id AND r.state = 'Succeeded'), 0)
    + COALESCE((SELECT sum(l.amount) FROM payments.ledger l
                 WHERE l.order_id = o.id AND l.type = 'Credit Refund'), 0),
  'refundable',
    COALESCE((
      SELECT GREATEST(
               COALESCE((SELECT sum(st.settled_amount)
                           FROM payments.attempts pa
                           JOIN payments.settlements st ON st.attempt_id = pa.id
                          WHERE pa.intent_id = src.id), 0)
               - COALESCE((SELECT sum(r.amount) FROM payments.refunds r
                            WHERE r.order_id = o.id AND r.state <> 'Failed'
                              AND r.payment_ref IN (SELECT pa.provider_ref
                                                      FROM payments.attempts pa
                                                     WHERE pa.intent_id = src.id)), 0),
               0)
        FROM (SELECT pi.id
                FROM payments.intents pi
               WHERE pi.order_id = o.id
                 AND pi.status = 'succeeded'
                 AND EXISTS (SELECT 1 FROM payments.attempts pa
                              WHERE pa.intent_id = pi.id AND pa.provider = 'stripe')
               ORDER BY pi.created_at DESC, pi.id DESC
               LIMIT 1) src), 0),
  'credit',
    GREATEST(
      COALESCE((SELECT sum(l.amount) FROM payments.ledger l
                 WHERE l.order_id = o.id AND l.type = 'Debit'), 0)
      - COALESCE((SELECT sum(l.amount) FROM payments.ledger l
                   WHERE l.order_id = o.id AND l.type = 'Credit Refund'), 0),
      0),
  'charge_received',
    EXISTS (SELECT 1 FROM payments.transfers tr
             WHERE tr.order_id = o.id AND tr.kind = 'charge' AND tr.state = 'Received')
    OR EXISTS (SELECT 1 FROM payments.intents pi
                WHERE pi.order_id = o.id AND pi.status = 'succeeded')
)
