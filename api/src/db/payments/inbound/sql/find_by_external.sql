SELECT * FROM payments.inbound_transactions
 WHERE source = $1::payments.inbound_source AND external_id = $2
