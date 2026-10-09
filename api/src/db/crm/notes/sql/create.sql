INSERT INTO crm.notes (user_id, lead_id, body)
VALUES ($1, $2, $3)
RETURNING id, user_id, lead_id, body, created_at, updated_at, created_by_id, updated_by_id,
          /*__author_name__*/ AS author_name
