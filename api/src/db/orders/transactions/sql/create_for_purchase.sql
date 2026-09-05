INSERT INTO orders.transactions (id, order_id, used_funds, payout_fee, payout_details_id)
SELECT gen_random_uuid(), $1, false, $2, c.payment_details_id
  FROM checkout.checkouts c
 WHERE c.id = $3
RETURNING *
