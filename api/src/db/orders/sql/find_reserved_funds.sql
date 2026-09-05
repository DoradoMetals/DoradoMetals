SELECT o.user_id, t.used_funds, t.funds AS reserved_funds
  FROM orders.orders o
  LEFT JOIN orders.transactions t ON t.order_id = o.id
 WHERE o.id = $1
