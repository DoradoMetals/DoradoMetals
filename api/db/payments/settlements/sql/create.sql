INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (id) DO UPDATE SET settled_amount = EXCLUDED.settled_amount
RETURNING id, attempt_id, settled_amount, provider, provider_ref, settled_at
