SELECT id, name, email, phone_number, phone_number_verified, dorado_funds,
       deletion_requested_at, "emailVerified" AS email_verified
  FROM auth.users
 WHERE id = $1
