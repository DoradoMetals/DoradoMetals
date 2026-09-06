SELECT id, subject, kind, sends, window_started_at, attempts, locked_until,
       last_sent_at, created_at, updated_at, created_by_id, updated_by_id
  FROM auth.otp_throttles
 WHERE subject = $1
