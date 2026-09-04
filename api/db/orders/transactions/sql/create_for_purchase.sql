-- WHAT A PURCHASE COMES TO AT PLACEMENT, MINUS THE POSTAGE. The payout account
-- is the checkout row's, so the statement copies it (ruling 66); the payout
-- METHOD's flat fee is a figure the server looked up, so it is a parameter.
--
-- `shipping` and `shipping_service` are deliberately absent: buying the label
-- is the outside-world step this write must not wait on (label-after-commit,
-- 2026-09-03), so domain/shipping/labels.ts patches both in once the carrier
-- has actually quoted and charged.
INSERT INTO orders.transactions (id, order_id, used_funds, payout_fee, payout_details_id)
SELECT gen_random_uuid(), $1, false, $2, c.payment_details_id
  FROM checkout.checkouts c
 WHERE c.id = $3
RETURNING *
