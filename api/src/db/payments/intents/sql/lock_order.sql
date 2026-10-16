-- Takes the row lock on the order an intent pays for, so a settlement decides
-- and writes under the same lock a sale cancel takes (orders/sql/lock.sql):
-- a cancel and a settlement serialize instead of each reading the other stale.
SELECT o.id
  FROM payments.intents pi
  JOIN orders.orders o ON o.id = pi.order_id
 WHERE pi.id = $1
   FOR UPDATE OF o
