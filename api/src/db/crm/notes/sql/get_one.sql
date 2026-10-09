SELECT id, user_id, lead_id, body, created_at, updated_at, created_by_id, updated_by_id,
       /*__author_name__*/ AS author_name
  FROM crm.notes
 WHERE id = $1
