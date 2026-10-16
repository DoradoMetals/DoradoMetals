-- What a card refund of an order goes back through: the newest succeeded
-- Stripe intent on the order and the card instrument recorded against it.
SELECT pa.provider_ref AS payment_ref, pi.details_id
  FROM payments.intents pi
  JOIN payments.attempts pa ON pa.intent_id = pi.id
 WHERE pi.order_id = $1
   AND pi.status = 'succeeded'
   AND pa.provider = 'stripe'
 ORDER BY pi.created_at DESC, pi.id DESC
 LIMIT 1
