SELECT * FROM payments.transfers
 WHERE provider = $1 AND provider_ref = $2
 ORDER BY created_at DESC, id
 LIMIT 1
