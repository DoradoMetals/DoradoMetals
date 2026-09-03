-- The customer an intent bills: who they are, and the provider's id for them.
--
-- auth.users is better-auth's table since the cutover (migration 107). Only
-- these four columns are read - name and email are what opening a Stripe
-- customer needs, and nothing here widens the users wire.
SELECT id, name, email, "stripeCustomerId"
  FROM auth.users
 WHERE id = $1
