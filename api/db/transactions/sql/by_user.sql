-- One customer's credit-ledger history, NEWEST first, composed on the wire's
-- own names: `type` is `transaction_type` there and `direction` is the ORDER's,
-- resolved through order_id.
--
-- THE JOIN REPLACES A SECOND ROUND TRIP. domain/transactions/compose.ts read
-- these rows, collected their order ids and asked orders.orders for the
-- directions in a second statement, then re-spelled all eight fields to graft
-- the answer on. One LEFT JOIN says the same thing, and a ledger row with no
-- order keeps a null direction because the join finds nothing.
SELECT l.id,
       l.user_id,
       l.type AS transaction_type,
       l.order_id,
       o.direction,
       l.amount,
       l.occurred_at,
       l.created_at,
       l.updated_at
  FROM payments.ledger l
  LEFT JOIN orders.orders o ON o.id = l.order_id
 WHERE l.user_id = $1
 ORDER BY l.occurred_at DESC, l.id DESC
