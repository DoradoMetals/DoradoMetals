SELECT d.id,
       d.user_id,
       t.order_id,
       m.type AS method,
       d.account_holder AS account_holder_name,
       d.bank_name,
       d.account_type,
       d.last_four AS account_last4,
       d.routing_last_four AS routing_last4,
       d.email_to,
       t.payout_fee AS cost,
       d.created_at
  FROM payments.details d
  LEFT JOIN orders.transactions t ON t.payout_details_id = d.id
  LEFT JOIN payments.methods m ON m.id = d.method_id
 WHERE d.id = $1
