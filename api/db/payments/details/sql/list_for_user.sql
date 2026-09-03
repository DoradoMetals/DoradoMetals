-- Every payout account one customer has saved, newest first. Same
-- last-four-only projection as get_one.sql.
SELECT id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at
  FROM payments.details
 WHERE user_id = $1
 ORDER BY created_at DESC, id DESC
