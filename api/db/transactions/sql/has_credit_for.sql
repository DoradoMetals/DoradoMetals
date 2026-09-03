-- Whether a Credit was ever logged against this order - the FACT the
-- abandonment refund guards on (D211): a refund that already happened must
-- not happen again, and the ledger is the record that it did.
SELECT EXISTS (
  SELECT 1 FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'
) AS refunded
