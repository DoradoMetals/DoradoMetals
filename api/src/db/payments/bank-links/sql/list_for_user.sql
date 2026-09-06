SELECT * FROM payments.bank_links
 WHERE user_id = $1
 ORDER BY status DESC, created_at DESC, id
