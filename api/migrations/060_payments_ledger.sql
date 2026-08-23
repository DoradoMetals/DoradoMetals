-- The customer credit ledger, which had no home in any of the eighteen schemas.
--
-- exchange.account_transactions records every movement of a customer's store
-- credit: `Credit` when a purchase order pays out to their balance rather than
-- their bank, `Debit` when they spend it on a sales order. Production holds
-- seventeen rows across eight customers totalling $66,999.32, dated June 2025
-- to January 2026, and features/sales-orders and features/purchase-orders write
-- it live today.
--
-- It was invisible to every audit because audit:coverage walked the feature map
-- and no feature declared it - January never built a target, and the table was
-- never counted among the seventeen. If exchange were retired it would go with
-- it. audit:coverage now reports undeclared tables for that reason.
--
-- Called `ledger` rather than `account_transactions` for the usual reason: the
-- namespace already says payments, and the schema drops redundant prefixes
-- everywhere else (product_name -> name, purchase_order_status -> status).
--
-- Two columns are reshaped, both following precedent set elsewhere:
--
--   transaction_type -> type, for the same reason.
--
--   purchase_order_id + sales_order_id -> order_id, because orders.orders holds
--   both kinds under one id. orders.spots did exactly this. Which kind an entry
--   belongs to is read back off orders.orders.direction, so nothing is lost;
--   repo.next.js projects both columns again and the wire shape is unchanged.
--
-- user_id deliberately carries no foreign key yet. exchange.users has one, but
-- the equivalent target is auth.users, which is not authoritative: USERS_SOURCE
-- is not promoted and 057 skips users whose email collides. A foreign key here
-- would make this ledger's completeness depend on an unfinished migration, and
-- a financial row refused at insert is worse than one with a dangling
-- reference. Add it when auth is promoted.
--
-- Additive. exchange is untouched, and nothing reads this until
-- TRANSACTIONS_SOURCE moves off its default.

CREATE TABLE IF NOT EXISTS payments.ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  type        text NOT NULL,
  order_id    uuid REFERENCES orders.orders(id) ON DELETE SET NULL,
  amount      numeric NOT NULL,
  occurred_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- exchange checks amount >= 0: the sign lives in `type`, not the number.
ALTER TABLE payments.ledger
  ADD CONSTRAINT ledger_amount_check CHECK (amount >= 0);

CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON payments.ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_order_id ON payments.ledger (order_id);
