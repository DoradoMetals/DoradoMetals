SELECT id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
  FROM payments.details
 WHERE provider = $1 AND provider_ref = $2
