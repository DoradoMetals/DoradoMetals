-- RULING 133. A cancelled sale gives back the credit it debited: one
-- 'Credit Refund' row per order for the sum of its Debit rows, written once, so
-- a second cancel or sweep matches nothing. The caller restores the balance in
-- the same transaction.
INSERT INTO payments.ledger (user_id, type, order_id, amount)
SELECT d.user_id, 'Credit Refund', d.order_id, sum(d.amount)
  FROM payments.ledger d
 WHERE d.order_id = $1
   AND d.type = 'Debit'
   AND NOT EXISTS (SELECT 1 FROM payments.ledger r
                    WHERE r.order_id = $1 AND r.type = 'Credit Refund')
 GROUP BY d.user_id, d.order_id
RETURNING id, user_id, type, order_id, amount, occurred_at, created_at, updated_at,
          created_by_id, updated_by_id
