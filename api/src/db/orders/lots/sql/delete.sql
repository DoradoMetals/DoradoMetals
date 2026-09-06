DELETE FROM orders.lots WHERE id = $1 RETURNING id
