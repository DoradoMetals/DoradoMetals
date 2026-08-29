-- The order link a payout needs, on the row that already holds its fee.
--
-- *** THE PROBLEM THIS CLOSES. *** 073 split exchange.payouts three ways: the
-- account became payments.details (keeping the payout's id), the fee became
-- orders.transactions.payout_fee, and the ORDER LINK was deliberately not
-- carried - "payments.details describes an account, and the same account serves
-- many orders; the order link lives on payments.intents."
--
-- payments.intents is a Stripe PaymentIntent: money coming IN. A payout is money
-- going OUT. So the successor statements built on that link
-- (features/payments/details/sql/link_to_order.sql and set_method_for_order.sql)
-- walk order -> payments.intents -> details, and MEASURED ON DEV that join
-- resolves for ZERO of the sixteen payouts, because all sixteen are on purchase
-- orders and every one of the twenty-one intents is on a sales order. Neither
-- statement raises on an empty update, so the failure is silent. D168.
--
-- *** WHY THE LINK BELONGS HERE. *** Measured against PRODUCTION rather than
-- assumed from dev: 62 payouts, every one carrying an order_id, and
-- `max(count(*)) GROUP BY order_id` is 1 - a payout is strictly one per order,
-- with no exceptions in the entire history of the business. orders.transactions
-- is already the per-order money row and already holds payout_fee (072/073), so
-- the account link joins the fee it is charged for rather than sitting in a
-- third place. It is the same shape as checkout.checkouts.payment_details_id,
-- which already points a thing-being-paid at the account paying it.
--
-- NOT on payments.details.order_id: that table's own header says it describes an
-- ACCOUNT and not an order, and an order column there would be wrong the first
-- day a customer is paid to the same bank account twice.
--
-- NULLABLE, and it will stay that way: sales orders have no payout at all, and
-- a purchase order paid before this column existed has no account row to point
-- at. Additive; nothing in exchange is read, written or dropped.
--
-- NO BANK DETAILS MOVE. routing_number and account_number stay in
-- exchange.payouts and nowhere else, exactly as 071 and 073 left them. This
-- migration adds one uuid.
--
-- Reversible: ALTER TABLE orders.transactions DROP COLUMN payout_details_id;
ALTER TABLE orders.transactions
  ADD COLUMN IF NOT EXISTS payout_details_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_payout_details_fk'
  ) THEN
    ALTER TABLE orders.transactions
      ADD CONSTRAINT transactions_payout_details_fk
      FOREIGN KEY (payout_details_id) REFERENCES payments.details(id);
  END IF;
END $$;

-- "which orders were paid to this account", the reverse lookup. exchange got it
-- from payouts(user_id) and a scan of 62 rows; the successor should not acquire
-- a sequential scan on the way across (audit:indexes).
CREATE INDEX IF NOT EXISTS transactions_payout_details_id_idx
  ON orders.transactions (payout_details_id);
