-- Carries the customer credit ledger across, keeping every row's own id.
--
-- The same guard as 029 and 031: this is only correct while exchange is
-- authoritative, so it refuses if payments.ledger already holds rows exchange
-- does not. exchange is only ever read.
--
-- One production row has neither order id - its order was deleted, and
-- exchange's foreign keys are ON DELETE SET NULL, so the entry survived its
-- order on purpose. It carries across with a null order_id, which is why
-- order_id is nullable here as it is there. Losing that row because it no
-- longer joins to anything would be losing a real $-value movement.

-- Guard ---------------------------------------------------------------
DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'payments.ledger' t WHERE EXISTS (
      SELECT 1 FROM payments.ledger n
      WHERE NOT EXISTS (
        SELECT 1 FROM exchange.account_transactions e WHERE e.id = n.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill the ledger: % holds rows exchange does not, so a switch has been promoted past dual and exchange is no longer authoritative.',
      offender;
  END IF;
END $$;

-- The ledger ----------------------------------------------------------
--
-- purchase_order_id and sales_order_id collapse into one order_id, because
-- orders.orders holds both kinds under one id. They are never both set - 0 rows
-- in dev and production - so a coalesce is exact rather than a choice.
--
-- The order reference is left null where the order has not itself been carried
-- across, rather than dropping the entry. The foreign key would refuse it, and
-- the entry is the record of money moving; the order it pointed at is context.

INSERT INTO payments.ledger (
  id, user_id, type, order_id, amount, occurred_at, created_at, updated_at
)
SELECT
  t.id,
  t.user_id,
  t.transaction_type,
  CASE
    WHEN EXISTS (SELECT 1 FROM orders.orders o
                  WHERE o.id = coalesce(t.purchase_order_id, t.sales_order_id))
    THEN coalesce(t.purchase_order_id, t.sales_order_id)
  END,
  t.amount,
  t.occurred_at,
  t.created_at,
  t.updated_at
FROM exchange.account_transactions t
ON CONFLICT (id) DO NOTHING;
