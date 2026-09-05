SELECT EXISTS (SELECT 1 FROM orders.orders WHERE id = $1) AS present
