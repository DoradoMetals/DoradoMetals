-- The attempt carrying one provider reference - a Stripe pi_... id. UNIQUE on
-- the column, so at most one row.
SELECT id, intent_id, method_id, provider, provider_ref, amount, status,
       error_code, error_message FROM payments.attempts WHERE provider_ref = $1
