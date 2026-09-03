-- One settlement, by id.
SELECT id, attempt_id, settled_amount, provider, provider_ref, settled_at FROM payments.settlements WHERE id = $1
