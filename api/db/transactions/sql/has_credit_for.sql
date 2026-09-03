-- Whether a Credit was ever logged against this order — the fact the abandonment refund guards on, so a refund that already happened can't happen again.
SELECT EXISTS (
  SELECT 1 FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'
) AS refunded
