-- One customer's credit balance, unlocked.
--
-- The quote surface's read: pricing needs the balance an order placed after
-- this quote would actually spend, so it asks the customer's own row rather
-- than trusting a number in the request body - a caller declaring their own
-- balance would be declaring their own discount. It does NOT lock, because a
-- quote decides nothing; the write path takes balance_for_update.sql instead.
--
-- Answering zero rows is a different fact from answering a balance of zero, and
-- the caller tells them apart - see repo.ts's `balance`.
SELECT dorado_funds
  FROM auth.users
 WHERE id = $1
