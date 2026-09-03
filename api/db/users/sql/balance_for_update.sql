-- One customer's credit balance, LOCKED for the rest of the transaction.
-- FOR UPDATE closes a lost-update race: two concurrent subtractions could
-- otherwise both pass a floor check only one can honour.
SELECT dorado_funds
  FROM auth.users
 WHERE id = $1
   FOR UPDATE
