-- The account carrying one provider reference - a Stripe pm_... id. UNIQUE on
-- (provider, provider_ref) where the reference is present.
SELECT id, user_id, method_id, account_holder, bank_name, account_type,
       last_four, routing_last_four, card_brand, email_to,
       provider, provider_ref, created_at, updated_at
  FROM payments.details
 WHERE provider = $1 AND provider_ref = $2
