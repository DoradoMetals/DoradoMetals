SELECT id, name, email, "stripeCustomerId"
  FROM auth.users
 WHERE id = $1
