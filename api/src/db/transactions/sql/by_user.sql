SELECT l.id,
       l.user_id,
       l.type AS transaction_type,
       l.order_id,
       o.direction,
       l.amount,
       l.occurred_at,
       l.created_at,
       l.updated_at
  FROM payments.ledger l
  LEFT JOIN orders.orders o ON o.id = l.order_id
 WHERE l.user_id = $1
 ORDER BY l.occurred_at DESC, l.id DESC
