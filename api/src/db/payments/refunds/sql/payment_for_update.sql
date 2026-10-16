-- An order's paid and refunded figures, read under a row lock on the order so
-- the refundable figure cannot change between this read and the Pending
-- refund written after it: two fast clicks cannot both pass.
SELECT o.user_id, /*__order_payment_facts__*/ AS payment
  FROM orders.orders o
 WHERE o.id = $1
   FOR UPDATE OF o
