-- The Payment card for a REFINER order. The same shape the customer side
-- answers, so nothing downstream branches: `refining_order_id` says which order
-- this is, `direction` carries the refiner vocabulary, and `amount_due` is the
-- Totals card's total rather than an orders.transactions column, because a
-- refiner order has no transactions row.
SELECT NULL::uuid AS order_id,
       ro.id AS refining_order_id,
       ro.number,
       ro.direction,
       money.total AS amount_due,
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
         WHERE d.id = f.details_id) AS payout_account
  FROM refining.orders ro
  LEFT JOIN refining.order_money money ON money.refining_order_id = ro.id
  LEFT JOIN payments.transfers f
         ON f.refining_order_id = ro.id AND f.state <> 'Failed'
 WHERE ro.id = $1
 ORDER BY f.created_at DESC NULLS LAST, f.id
 LIMIT 1
