-- What was TRIED against an intent. The amount is in DOLLARS; Stripe speaks
-- cents and the caller divides.
--
-- An explicit id wins. The intent's own id is what every caller passes, so an
-- intent and its first attempt share one id - which is what lets a settlement
-- key off the same value.
INSERT INTO payments.attempts
       (id, intent_id, method_id, provider, provider_ref, amount, status)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
RETURNING id, intent_id, method_id, provider, provider_ref, amount, status,
       error_code, error_message
