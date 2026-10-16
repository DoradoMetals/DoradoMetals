-- What each rail owes under a split (ruling 132): the credit to the customer's
-- Dorado balance, and what the transfer pays. Both NULL when the order has no
-- split, so the caller pays the whole total by the one method.
SELECT sum(pm.amount) FILTER (WHERE m.type = 'DORADO_ACCOUNT') AS account,
       sum(pm.amount) FILTER (WHERE m.type <> 'DORADO_ACCOUNT') AS transfer,
       count(*) > 0 AS split
  FROM orders.payout_methods pm
  JOIN payments.methods m ON m.id = pm.method_id
 WHERE pm.order_id = $1
