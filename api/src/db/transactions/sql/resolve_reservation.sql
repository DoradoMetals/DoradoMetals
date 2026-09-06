-- RULING 88. A reservation is one ledger row, and it is resolved by ONE
-- statement, so a release and a settlement cannot both take it and a second
-- release matches nothing. The row keeps its amount and its order; only what
-- happened to the money changes.
UPDATE payments.ledger
   SET type = $2
 WHERE order_id = $1
   AND type = 'Reserve'
RETURNING id, user_id, type, order_id, amount, occurred_at, created_at, updated_at
