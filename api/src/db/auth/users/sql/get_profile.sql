SELECT id, name, email, phone_number, phone_number_verified, dorado_funds,
       deletion_requested_at, sms_consent_at, sms_consent_method,
       "emailVerified" AS email_verified
  FROM auth.users
 WHERE id = $1
