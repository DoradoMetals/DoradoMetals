-- Change the payout method for one order.
--
-- The legacy statement updated exchange.payouts.method by order_id. Here the
-- method is a foreign key on the account, and the account is reached through
-- the order's intent - so this walks order -> intent -> details and updates the
-- method there. Same (direction, type) resolution and same DORADO_ACCOUNT
-- rename as create.sql.
UPDATE payments.details d
   SET method_id  = m.id,
       updated_at = now()
  FROM payments.intents i, payments.methods m
 WHERE i.order_id = $1
   AND d.id = i.details_id
   AND m.direction = 'purchase'
   AND m.type = CASE $2::text WHEN 'DORADO_ACCOUNT' THEN 'DORADO CREDIT' ELSE $2::text END
RETURNING d.id
