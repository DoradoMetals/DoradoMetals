SELECT id, user_id, lead_id, order_id, body, created_at, updated_at, created_by_id, updated_by_id,
       created_by_id AS author_id
  FROM crm.notes
 WHERE id = $1
