-- Point the order's payment intent at the account it should pay out to.
--
-- This is the join 073 names: payments.details holds the account, orders.orders
-- holds the order, and payments.intents carries both keys. Scoped by order_id
-- so it cannot touch another order's intent.
UPDATE payments.intents
   SET details_id = $2,
       updated_at = now()
 WHERE order_id = $1
RETURNING id
