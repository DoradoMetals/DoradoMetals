SELECT id, phone_number, email, name, expires_at,
       created_at, updated_at, created_by_id, updated_by_id
  FROM auth.pending_signups
 WHERE id = $1
