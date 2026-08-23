-- The payout fee joins the other fees.
--
-- exchange.payouts.cost is what the customer is charged for the payout method -
-- a wire costs more than store credit - and it is populated on every payout in
-- production. calculateTotalPrice subtracts it from the order total, so it is
-- part of what an order is worth.
--
-- It has nowhere to go in payments: payments.details describes a bank account,
-- not a per-order charge, and the same account is used across orders. The fee
-- belongs with the order's other fee policy, which 033 already moved to
-- orders.transactions - refiner_fee, shipping_fee_actual, waive_payout_fee are
-- all there. waive_payout_fee being there without the fee it waives was the
-- clue.
--
-- Additive and nullable. exchange is untouched.

ALTER TABLE orders.transactions
  ADD COLUMN IF NOT EXISTS payout_fee numeric;
