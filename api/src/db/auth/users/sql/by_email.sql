SELECT id, email, name, "createdAt", "updatedAt", "emailVerified", image, role,
       "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires",
       phone_number, "isAnonymous", phone_number_verified, deletion_requested_at,
       sms_consent_at, sms_consent_method
  FROM auth.users
 WHERE lower(email) = lower($1)
 ORDER BY "createdAt" ASC, id ASC
 LIMIT 1
