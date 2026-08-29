-- Point every order at the account its payout was sent to.
--
-- 099 added orders.transactions.payout_details_id; this fills it from the one
-- place the link has ever been recorded, exchange.payouts.order_id.
--
-- The join is exact rather than heuristic: 073 gives each payments.details row
-- THE PAYOUT'S OWN id, so `d.id = p.id` is an identity and not a match. The
-- EXISTS is what keeps the foreign key satisfiable on a build where 073 skipped
-- a payout (it inserts only `WHERE p.user_id IS NOT NULL`).
--
-- Idempotent, and it never overwrites: the WHERE only touches rows whose link is
-- still NULL, so re-running after an admin has changed an order's payout account
-- leaves the newer value alone. That is the same rule 096 follows, and it is the
-- rule that makes a backfill safe to replay - CLAUDE.md's warning is about a
-- backfill that overwrites new rows with stale ones, and this one cannot.
--
-- exchange is only READ.
--
-- WHAT RESOLVES, measured before writing it:
--   dev   16 payouts, 16 with an orders.transactions row, 16 with a details
--         row -> 16 of 16 link.
--   prod  62 payouts, all with an order_id, 47 whose order has an orders.orders
--         row. 0 link TODAY, and none of that is this migration's doing: prod
--         has never run 033 (orders.transactions' columns), 072 (payout_fee) or
--         073 (payments.details), so there is nothing on either end to join yet.
--         Run in the documented sequence they resolve with the rest; the 15
--         payouts whose order predates orders.orders resolve when the orders
--         backfill does, and until then they keep their exchange row, which is
--         still the only copy of a bank detail anyway.
UPDATE orders.transactions t
   SET payout_details_id = p.id,
       updated_at = now()
  FROM exchange.payouts p
 WHERE p.order_id = t.order_id
   AND t.payout_details_id IS NULL
   AND EXISTS (SELECT 1 FROM payments.details d WHERE d.id = p.id);
