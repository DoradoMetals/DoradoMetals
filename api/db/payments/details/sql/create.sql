INSERT INTO payments.details
       (user_id, method_id, account_holder, bank_name, account_type,
        last_four, routing_last_four, email_to,
        routing_number_encrypted, account_number_encrypted, encryption_key_id,
        card_brand, provider, provider_ref)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at
