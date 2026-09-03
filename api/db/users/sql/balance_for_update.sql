-- One customer's credit balance, locked for the rest of the transaction.
-- FOR UPDATE closes a lost-update race: two concurrent subtractions could otherwise both pass a floor check only one can honour.
SELECT dorado_funds
  FROM exchange.users
 WHERE id = $1
   FOR UPDATE
