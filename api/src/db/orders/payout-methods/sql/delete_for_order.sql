-- A split is a plan, not a payment: replacing it clears the plan rows. The
-- service only calls this while no payout and no credit has moved for the
-- order (orders/rules.ts assertSplitEditable), so nothing paid is lost.
DELETE FROM orders.payout_methods WHERE order_id = $1
