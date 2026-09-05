WITH victims AS (
  SELECT id FROM auth.users
   WHERE id = ANY($1::uuid[])
     AND "isAnonymous"
),
dead_checkouts AS (
  DELETE FROM checkout.checkouts
   WHERE user_id IN (SELECT id FROM victims)
  RETURNING id
),
dead_book AS (
  DELETE FROM places.user_addresses
   WHERE user_id IN (SELECT id FROM victims)
  RETURNING id
),
dead_sessions AS (
  DELETE FROM auth.sessions
   WHERE "userId" IN (SELECT id FROM victims)
  RETURNING id
),
dead_accounts AS (
  DELETE FROM auth.account
   WHERE "userId" IN (SELECT id FROM victims)
  RETURNING id
)
DELETE FROM auth.users
 WHERE id IN (SELECT id FROM victims)
RETURNING id
