UPDATE auth.users
   SET email                 = coalesce($2, email),
       name                  = coalesce($3, name),
       "emailVerified"       = coalesce($4, "emailVerified"),
       phone_number          = coalesce($5, phone_number),
       phone_number_verified = coalesce($6, phone_number_verified),
       "updatedAt"           = now()
 WHERE id = $1
RETURNING id, email, name, "createdAt", "updatedAt", "emailVerified", image, role,
          "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires",
          phone_number, "isAnonymous", phone_number_verified
