SELECT id, user_id, lead_id, order_id, refining_order_id, body, created_at, updated_at,
       created_by_id, updated_by_id, created_by_id AS author_id
  FROM crm.notes
 WHERE ($1::uuid IS NOT NULL AND user_id = $1)
    OR ($2::uuid IS NOT NULL AND lead_id = $2)
    OR ($3::uuid IS NOT NULL AND order_id = $3)
    OR ($4::uuid IS NOT NULL AND refining_order_id = $4)
 ORDER BY created_at DESC, id DESC
