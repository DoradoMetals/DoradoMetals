WITH victims AS (
  SELECT id FROM auth.users u
   WHERE u.id = ANY($1::uuid[])
     AND u."isAnonymous"
     AND NOT EXISTS (SELECT 1 FROM auth.employees      e  WHERE e.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM auth.sessions       si WHERE si."impersonatedBy" = u.id)
     AND NOT EXISTS (SELECT 1 FROM orders.orders       o  WHERE o.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM payments.intents    pi WHERE pi.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM payments.details    pd WHERE pd.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM payments.ledger     pl WHERE pl.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM media.images        mi WHERE mi.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM media.emails        me WHERE me.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM reviews.reviews     r  WHERE r.user_id = u.id)
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
