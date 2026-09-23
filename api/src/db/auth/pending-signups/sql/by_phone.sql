SELECT id, phone_number, email, name, expires_at, sms_consent,
       created_at, updated_at, created_by_id, updated_by_id
  FROM auth.pending_signups
 WHERE phone_number = $1
