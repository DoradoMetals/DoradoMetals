INSERT INTO auth.pending_signups (phone_number, email, name, expires_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (phone_number) DO UPDATE SET
       email      = EXCLUDED.email,
       name       = EXCLUDED.name,
       expires_at = EXCLUDED.expires_at
RETURNING id, phone_number, email, name, expires_at,
          created_at, updated_at, created_by_id, updated_by_id
