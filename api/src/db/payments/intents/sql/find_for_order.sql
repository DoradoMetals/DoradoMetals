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
 WHERE i.order_id = $1
 ORDER BY i.created_at DESC, i.id, a.created_at DESC, a.id, st.created_at DESC, st.id
 LIMIT 1
