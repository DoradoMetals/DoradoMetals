-- The Refunds card: every refund of an order, newest first, with the card it
-- went back to (brand and last four only; never a full number).
SELECT r.id,
       r.order_id,
       r.rail,
       r.provider,
       r.payment_ref,
       r.details_id,
       r.amount,
       r.reason,
       r.state,
       r.provider_ref,
       r.failure_reason,
       to_char(r.refunded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS refunded_at,
       to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       r.created_by_id,
       r.updated_by_id,
       d.card_brand,
       CASE WHEN d.card_brand IS NULL THEN NULL ELSE d.last_four END AS card_last4
  FROM payments.refunds r
  LEFT JOIN payments.details d ON d.id = r.details_id
 WHERE r.order_id = $1
 ORDER BY r.created_at DESC, r.id DESC
