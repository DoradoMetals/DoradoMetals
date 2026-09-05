INSERT INTO payments.intents
       (session_id, user_id, type, status, amount_expected, order_id, details_id, method_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, order_id, method_id, details_id, amount_expected, status,
       created_at, updated_at, created_by, updated_by,
       created_by_id, updated_by_id, session_id, user_id, type
