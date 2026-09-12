SELECT id, email, name, "createdAt", "updatedAt", "emailVerified", image, role,
       "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires",
       phone_number, "isAnonymous", phone_number_verified, deletion_requested_at
  FROM auth.users
 WHERE id = $1
