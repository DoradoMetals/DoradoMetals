SELECT id, user_id, factor, next_value, verified_via, sent_to, expires_at,
       confirmed_at, created_at, updated_at, created_by_id, updated_by_id
  FROM auth.pending_changes
 WHERE id = $1
