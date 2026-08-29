-- Which account this order's payout is sent to.
--
-- THE STATEMENT THAT REPLACES A JOIN THAT NEVER RESOLVED. Before 099 this link
-- lived on payments.intents (features/payments/details/sql/link_to_order.sql,
-- now deleted): an UPDATE keyed on `intents.order_id`, for a row that is a
-- Stripe PaymentIntent - money coming IN. A payout is money going OUT, and dev
-- had zero intents on any of the 48 purchase orders, so the statement matched
-- nothing and returned quietly. D168, and the migration header for the numbers.
--
-- The account itself is payments' (payments.details); WHERE it is pointed from
-- is the order's, so the write lives here. Same shape as
-- checkout.checkouts.payment_details_id.
--
-- `by` behaves as it does in set_amount.sql: null coalesces to the existing
-- author rather than erasing them.
--
-- Returns the row so the caller can tell "written" from "there was no
-- orders.transactions row for that order" - an UPDATE against a missing row is
-- a silent no-op, which is the failure this statement exists to stop repeating.
UPDATE orders.transactions
   SET payout_details_id = $1,
       updated_by = coalesce($2, updated_by),
       updated_at = now()
 WHERE order_id = $3
RETURNING id, order_id, payout_details_id
