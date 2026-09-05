SELECT c.direction
  FROM checkout.checkouts c
 WHERE c.id = $1::uuid
