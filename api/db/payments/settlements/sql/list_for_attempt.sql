-- What settled against one attempt.
SELECT id, attempt_id, settled_amount, provider, provider_ref, settled_at FROM payments.settlements WHERE attempt_id = $1 ORDER BY id
