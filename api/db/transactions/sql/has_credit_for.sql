SELECT EXISTS (
  SELECT 1 FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'
) AS refunded
