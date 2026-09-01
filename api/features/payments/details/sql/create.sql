-- A payout account, created when a customer tells us where to send their money.
--
-- The new-schema half of the legacy insertPayout, which wrote one flat row to
-- exchange.payouts. That row splits three ways here, exactly as 073 describes
-- for the backfill:
--
--   the account          -> payments.details  (this statement)
--   the order link       -> payments.intents.details_id
--   the per-order fee    -> orders.transactions.payout_fee
--
-- A detail row describes an ACCOUNT, not an order, and the same account serves
-- many orders - which is why order_id is not a column here and the link is made
-- separately.
--
-- ROUTING AND ACCOUNT NUMBERS ARE DELIBERATELY NOT WRITTEN.
--
-- They are the only plaintext bank details the business holds. 071 removed
-- January's copy of them from this table and 073 refused to re-create it;
-- writing them here would put the same secret in a second place while
-- encryption at rest is still outstanding. They stay in exchange.payouts until
-- that lands. last_four is safe and is what order responses show.
--
-- method is resolved against payments.methods on (direction, type), directly:
-- 073's one rename (DORADO_ACCOUNT was called DORADO CREDIT there) ended when
-- 109 reconciled the row to the vocabulary the stored payouts speak.
INSERT INTO payments.details (
  user_id, method_id, account_holder, bank_name, account_type, last_four, email_to
)
SELECT
  $1,
  m.id,
  $3, $4, $5, $6, $7
FROM payments.methods m
WHERE m.direction = 'purchase'
  AND m.type = $2::text
RETURNING id
