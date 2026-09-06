SELECT o.id AS order_id,
       NULL::uuid AS refining_order_id,
       o.number,
       o.direction,
       CASE WHEN o.direction = 'sale' THEN t.post_charges_amount ELSE t.total END AS amount_due,
       f.id AS transfer_id,
       f.kind,
       f.rail,
       f.state,
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
         WHERE d.id = COALESCE(f.details_id, t.payout_details_id)) AS payout_account
  FROM orders.orders o
  LEFT JOIN orders.transactions t ON t.order_id = o.id
  LEFT JOIN payments.transfers f ON f.order_id = o.id AND f.state <> 'Failed'
 WHERE o.id = $1
 ORDER BY f.created_at DESC NULLS LAST, f.id
 LIMIT 1
