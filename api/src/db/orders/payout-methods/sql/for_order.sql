SELECT pm.id, pm.order_id, pm.method_id, pm.amount, pm.created_at, pm.updated_at,
       pm.created_by_id, pm.updated_by_id
  FROM orders.payout_methods pm
  JOIN payments.methods m ON m.id = pm.method_id
 WHERE pm.order_id = $1
 ORDER BY m.sort_order ASC, pm.id ASC
