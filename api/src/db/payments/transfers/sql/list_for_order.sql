SELECT * FROM payments.transfers WHERE order_id = $1 ORDER BY created_at DESC, id
