INSERT INTO auth.pending_signups (phone_number, email, name, expires_at, sms_consent)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (phone_number) DO UPDATE SET
       email        = EXCLUDED.email,
       name         = EXCLUDED.name,
       expires_at   = EXCLUDED.expires_at,
       sms_consent  = EXCLUDED.sms_consent
RETURNING id, phone_number, email, name, expires_at, sms_consent,
          created_at, updated_at, created_by_id, updated_by_id
