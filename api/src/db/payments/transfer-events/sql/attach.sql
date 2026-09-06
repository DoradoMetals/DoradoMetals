UPDATE payments.transfer_events
   SET transfer_id = $2, applied = $3
 WHERE id = $1
