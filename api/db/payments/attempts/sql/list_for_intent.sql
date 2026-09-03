-- Every attempt made against one intent. One intent means one attempt today;
-- a retried charge would add a second, which is why this is a list.
SELECT id, intent_id, method_id, provider, provider_ref, amount, status,
       error_code, error_message FROM payments.attempts WHERE intent_id = $1 ORDER BY id
