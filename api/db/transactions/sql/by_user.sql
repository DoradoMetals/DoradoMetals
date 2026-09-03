-- One customer's credit-ledger history, oldest first. Returns the WHOLE history; the SERVICE hands back only its first row — deliberate (the endpoint's shape is pinned, and shapes don't move during a schema migration), not a bug in this statement.
SELECT l.id,
       l.user_id,
       l.type,
       l.order_id,
       l.amount,
       l.occurred_at,
       l.created_at,
       l.updated_at
  FROM payments.ledger l
 WHERE l.user_id = $1
 ORDER BY l.occurred_at, l.id
