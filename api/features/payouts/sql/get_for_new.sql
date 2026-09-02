-- The payout of a NEW-flow order (D210): no exchange row exists - the account
-- lives in payments.details (numbers sealed), the fee on orders.transactions.
-- Same wire shape as get_for.sql, so every drawer renders it unchanged; the
-- row's id IS the details id, which is what the admin details endpoint opens.
-- routing_last4 is null - only the account's last four are stored unsealed.
SELECT d.id,
       d.user_id,
       t.order_id,
       m.type AS method,
       d.account_holder AS account_holder_name,
       d.bank_name,
       d.account_type,
       d.last_four AS account_last4,
       NULL::text AS routing_last4,
       d.email_to,
       t.payout_fee AS cost,
       d.created_at
  FROM orders.transactions t
  JOIN payments.details d ON d.id = t.payout_details_id
  LEFT JOIN payments.methods m ON m.id = d.method_id
 WHERE t.order_id = $1
