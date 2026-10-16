-- Takes the order's row lock for the rest of the caller's transaction, so a
-- decision read after it cannot be raced by a writer that takes the same lock.
SELECT id FROM orders.orders WHERE id = $1 FOR UPDATE
