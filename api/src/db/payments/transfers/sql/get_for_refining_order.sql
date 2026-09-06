SELECT * FROM payments.transfers
 WHERE refining_order_id = $1 AND kind = $2::payments.transfer_kind AND state <> 'Failed'
 ORDER BY created_at DESC, id
 LIMIT 1
