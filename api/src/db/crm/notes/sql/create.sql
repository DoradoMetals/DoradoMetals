INSERT INTO crm.notes (user_id, lead_id, order_id, refining_order_id, body)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, user_id, lead_id, order_id, refining_order_id, body, created_at, updated_at,
          created_by_id, updated_by_id, created_by_id AS author_id
