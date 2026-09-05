SELECT d.id, d.user_id, d.method_id, d.account_holder, d.bank_name, d.account_type,
       d.last_four, d.routing_last_four, d.card_brand, d.email_to,
       d.provider, d.provider_ref,
       to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       (SELECT jsonb_build_object(
                 'order_id', t.order_id,
                 'payout_fee', t.payout_fee,
                 'waive_payout_fee', t.waive_payout_fee)
          FROM orders.transactions t
         WHERE t.payout_details_id = d.id) AS "order"
  FROM payments.details d
 WHERE d.id = $1
