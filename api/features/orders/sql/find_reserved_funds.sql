-- What a cancellation must put back: the credit reserved at creation
-- (orders.transactions.funds, 073's pre_charges_amount mapping) and whose it
-- was. One row per order by design.
SELECT o.user_id, t.used_funds, t.funds AS reserved_funds
  FROM orders.orders o
  LEFT JOIN orders.transactions t ON t.order_id = o.id
 WHERE o.id = $1
