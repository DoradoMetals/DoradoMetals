-- THE ONE READ THAT CAN CHARGE A CUSTOMER TWICE. An intent is offered back for
-- reuse only while it has not resolved; succeeded, processing and canceled are
-- excluded here and nowhere else.
--
-- amount_received comes off the SETTLEMENT, because that is what settlements
-- are for: an intent records what was asked for, a settlement what moved.
-- amount_capturable has no column - it is Stripe's fact about an
-- uncaptured authorisation and nothing reads it.
SELECT i.id,
       i.session_id,
       i.user_id,
       i.type,
       i.status,
       i.order_id,
       o.direction,
       i.amount_expected,
       st.settled_amount AS amount_received,
       NULL::numeric     AS amount_capturable,
       i.created_at,
       i.updated_at,
       jsonb_build_object(
         'provider',     a.provider,
         'provider_ref', a.provider_ref,
         'status',       a.status
       ) AS attempt,
       CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
         'provider',     d.provider,
         'provider_ref', d.provider_ref,
         'type',         pm.type,
         'last_four',    d.last_four,
         'card_brand',   d.card_brand,
         'bank_name',    d.bank_name,
         'account_type', d.account_type
       ) END AS details
  FROM payments.intents i
  LEFT JOIN payments.attempts    a  ON a.intent_id = i.id
  LEFT JOIN payments.settlements st ON st.attempt_id = a.id
  LEFT JOIN payments.details     d  ON d.id = i.details_id
  LEFT JOIN payments.methods     pm ON pm.id = d.method_id
  LEFT JOIN orders.orders        o  ON o.id = i.order_id
 WHERE i.session_id = $1
   AND i.user_id = $2
   AND i.type = $3
   AND i.status NOT IN ('succeeded', 'processing', 'canceled')
 ORDER BY i.created_at DESC, i.id
 LIMIT 1
