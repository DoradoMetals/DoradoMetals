SELECT id, user_id, lead_id, body, created_at, updated_at, created_by_id, updated_by_id,
       /*__author_name__*/ AS author_name
  FROM crm.notes
 WHERE ($1::uuid IS NOT NULL AND user_id = $1)
    OR ($2::uuid IS NOT NULL AND lead_id = $2)
 ORDER BY created_at DESC, id DESC
