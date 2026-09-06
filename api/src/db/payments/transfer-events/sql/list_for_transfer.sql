SELECT * FROM payments.transfer_events
 WHERE transfer_id = $1
 ORDER BY occurred_at ASC, created_at ASC, id
