-- Change the payout method for one order.
--
-- The legacy statement updated exchange.payouts.method by order_id. Here the
-- method is a foreign key on the ACCOUNT, and the account is reached from the
-- order.
--
-- *** IT USED TO WALK order -> payments.intents -> details, AND THAT JOIN DID
-- NOT EXIST. *** An intent is a Stripe PaymentIntent, money coming IN; a payout
-- is money going OUT. Measured on dev: 8 intents, all on sales orders, against
-- 48 purchase orders and 16 payouts - so this statement matched no rows for
-- every order it was ever meant to serve, and an UPDATE that matches nothing
-- does not raise. D168; 099 replaced the link with
-- orders.transactions.payout_details_id and this now walks that.
--
-- Same (direction, type) resolution and same DORADO_ACCOUNT rename as
-- create.sql.
UPDATE payments.details d
   SET method_id  = m.id,
       updated_at = now()
  FROM orders.transactions t, payments.methods m
 WHERE t.order_id = $1
   AND d.id = t.payout_details_id
   AND m.direction = 'purchase'
   AND m.type = CASE $2::text WHEN 'DORADO_ACCOUNT' THEN 'DORADO CREDIT' ELSE $2::text END
RETURNING d.id
