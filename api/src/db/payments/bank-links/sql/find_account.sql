SELECT * FROM payments.bank_links
 WHERE user_id = $1
 ORDER BY created_at ASC, id
 LIMIT 1
