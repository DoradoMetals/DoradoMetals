-- An order's payment card: its live transfer, or its latest Failed one (with
-- failure_reason) when no live transfer exists, plus the card intent's state,
-- the card's brand and last four and the amount the provider settled. A card
-- sale has no transfer row: its rail and state come from the intent and its
-- settlements.
SELECT o.id AS order_id,
       NULL::uuid AS refining_order_id,
       o.number,
       o.direction,
       CASE WHEN o.direction = 'sale' THEN t.post_charges_amount ELSE t.total END AS amount_due,
       f.id AS transfer_id,
       f.kind,
       COALESCE(f.rail,
                CASE WHEN card.id IS NOT NULL OR im.type = 'CARD'
                     THEN 'CARD'::payments.rail END) AS rail,
       COALESCE(f.state,
                CASE WHEN i.status = 'succeeded' OR s.settled > 0 THEN 'Received'
                     WHEN i.status IN ('processing', 'requires_capture') THEN 'Processing'
                     WHEN i.status IN ('requires_payment_method', 'requires_confirmation',
                                       'requires_action') THEN 'Due'
                END::payments.transfer_state) AS state,
       f.amount,
       f.reference,
       f.failure_reason,
       f.provider,
       CASE WHEN f.provider_ref IS NULL THEN NULL
            ELSE '****' || right(f.provider_ref, 4) END AS provider_ref,
       to_char(f.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at,
       to_char(f.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at,
       (SELECT jsonb_build_object(
                 'id', b.id,
                 'rail', b.rail,
                 'bank_name', b.bank_name,
                 'holder_name', b.holder_name,
                 'last_four', b.last_four,
                 'status', b.status,
                 'payment_method_id', b.payment_method_id)
          FROM payments.bank_links b
         WHERE b.id = f.bank_link_id) AS pay_to,
       (SELECT jsonb_build_object(
                 'id', d.id,
                 'bank_name', d.bank_name,
                 'account_type', d.account_type,
                 'last_four', d.last_four,
                 'email_to', d.email_to,
                 'method', m.type)
          FROM payments.details d
          LEFT JOIN payments.methods m ON m.id = d.method_id
         WHERE d.id = COALESCE(f.details_id, t.payout_details_id)) AS payout_account,
       CASE WHEN i.status IN ('requires_payment_method', 'requires_confirmation',
                              'requires_action', 'processing', 'requires_capture',
                              'canceled', 'succeeded')
            THEN i.status END AS intent_status,
       card.card_brand,
       card.last_four AS card_last4,
       CASE WHEN i.id IS NULL THEN NULL ELSE s.settled END AS amount_received
  FROM orders.orders o
  LEFT JOIN orders.transactions t ON t.order_id = o.id
  LEFT JOIN payments.transfers f ON f.order_id = o.id
  LEFT JOIN LATERAL (SELECT pi.id, pi.status, pi.details_id, pi.method_id
                       FROM payments.intents pi
                      WHERE pi.order_id = o.id
                      ORDER BY pi.created_at DESC, pi.id DESC
                      LIMIT 1) i ON true
  LEFT JOIN payments.methods im ON im.id = i.method_id
  LEFT JOIN payments.details card ON card.id = i.details_id AND card.card_brand IS NOT NULL
  LEFT JOIN LATERAL (SELECT COALESCE(sum(st.settled_amount), 0) AS settled
                       FROM payments.attempts pa
                       JOIN payments.settlements st ON st.attempt_id = pa.id
                      WHERE pa.intent_id = i.id) s ON true
 WHERE o.id = $1
 ORDER BY (f.state = 'Failed') ASC NULLS LAST, f.created_at DESC NULLS LAST, f.id
 LIMIT 1
