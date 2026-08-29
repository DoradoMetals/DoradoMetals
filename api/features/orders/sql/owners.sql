-- Who several orders belong to, in one statement.
--
-- The batched form of owner_of.sql. A pickup's user_id is reconstructed through
-- its shipment's order, and composing a list of orders asked that question once
-- per order until D101.
SELECT id, user_id
  FROM orders.orders
 WHERE id = ANY($1::uuid[])
