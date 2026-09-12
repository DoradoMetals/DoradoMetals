SELECT id, phone_number, email, name, expires_at,
       created_at, updated_at, created_by_id, updated_by_id
  FROM auth.pending_signups
 WHERE email = $1 AND phone_number IS NULL
