INSERT INTO payments.attempts
       (id, intent_id, method_id, provider, provider_ref, amount, status)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
RETURNING id, intent_id, method_id, provider, provider_ref, amount, status,
       error_code, error_message
