INSERT INTO auth.otp_throttles (subject, kind)
VALUES ($1, $2)
ON CONFLICT (subject) DO UPDATE SET subject = EXCLUDED.subject
RETURNING id, subject, kind, sends, window_started_at, attempts, locked_until,
          last_sent_at, created_at, updated_at, created_by_id, updated_by_id
