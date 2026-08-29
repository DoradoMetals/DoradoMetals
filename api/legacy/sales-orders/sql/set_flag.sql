-- Mirror of features/orders/sql/set_flag.sql (D42). Same closed set of three column names, same
-- reasoning about the substitution.
UPDATE exchange.sales_orders
   SET __COLUMN__ = true
 WHERE id = $1
RETURNING id
