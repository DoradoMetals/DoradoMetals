-- The payout account, recorded AT THE PAYOUT STEP (D210) - not at order
-- creation. Upsert on id: the checkout row keeps the same details row across
-- edits, so a customer correcting a digit rewrites in place rather than
-- littering rows.
--
-- ROUTING AND ACCOUNT NUMBERS ARRIVE AS ENVELOPES, sealed by the service with
-- the row's own id in the AAD - this statement never sees a plaintext number,
-- and the legacy plaintext columns beside these stay NULL forever. The method
-- resolves against payments.methods by (direction, type) exactly as
-- create.sql documents; a method that resolves to nothing writes nothing.
INSERT INTO payments.details (
  id, user_id, method_id, account_holder, bank_name, account_type,
  last_four, email_to,
  routing_number_encrypted, account_number_encrypted, encryption_key_id
)
SELECT
  $1, $2, m.id, $4, $5, $6, $7, $8, $9, $10, $11
FROM payments.methods m
WHERE m.direction = 'purchase'
  AND m.type = $3::text
ON CONFLICT (id) DO UPDATE SET
  method_id = EXCLUDED.method_id,
  account_holder = EXCLUDED.account_holder,
  bank_name = EXCLUDED.bank_name,
  account_type = EXCLUDED.account_type,
  last_four = EXCLUDED.last_four,
  email_to = EXCLUDED.email_to,
  routing_number_encrypted = EXCLUDED.routing_number_encrypted,
  account_number_encrypted = EXCLUDED.account_number_encrypted,
  encryption_key_id = EXCLUDED.encryption_key_id,
  updated_at = now()
RETURNING id, method_id, account_holder, bank_name, account_type, last_four, email_to
