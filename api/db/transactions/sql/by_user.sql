-- One customer's credit-ledger history, oldest first.
--
-- RETURNS THE WHOLE HISTORY, and the SERVICE hands back only its first row.
--
-- That asymmetry is deliberate: the endpoint has always returned one row, the
-- shape is pinned by replay.test.js with its reason, and shapes do not move
-- during a schema migration. The statement is honest about what a history is;
-- service.getTransactionHistory is honest about what the endpoint returns.
--
-- `type` and `order_id` ARE projected even though the generator excluded them
-- as new-schema-only: they are RENAMES of transaction_type and of the pair
-- purchase_order_id/sales_order_id, and compose.ts needs both to rebuild the
-- shape exchange returned.
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
