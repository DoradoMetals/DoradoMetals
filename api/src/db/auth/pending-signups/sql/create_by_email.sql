INSERT INTO auth.pending_signups (phone_number, email, name, expires_at)
VALUES (NULL, $1, $2, $3)
ON CONFLICT (email) WHERE phone_number IS NULL DO UPDATE SET
       name       = EXCLUDED.name,
       expires_at = EXCLUDED.expires_at
RETURNING id, phone_number, email, name, expires_at,
          created_at, updated_at, created_by_id, updated_by_id
