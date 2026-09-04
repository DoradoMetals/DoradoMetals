SELECT id, order_id, method_id, details_id, amount_expected, status,
       created_at, updated_at, created_by, updated_by,
       created_by_id, updated_by_id, session_id, user_id, type
  FROM payments.intents
 WHERE id = $1
