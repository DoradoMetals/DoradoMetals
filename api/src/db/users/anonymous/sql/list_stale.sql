SELECT u.id,
       GREATEST(
         u."updatedAt",
         COALESCE(s.last_session, u."updatedAt"),
         COALESCE(i.last_item,    u."updatedAt")
       ) AS last_seen
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT max(s."updatedAt") AS last_session
      FROM auth.sessions s
     WHERE s."userId" = u.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT max(cl.updated_at) AS last_item
      FROM checkout.checkouts c
      JOIN checkout.lots cl ON cl.checkout_id = c.id
     WHERE c.user_id = u.id
  ) i ON true
 WHERE u."isAnonymous"
   AND GREATEST(
         u."updatedAt",
         COALESCE(s.last_session, u."updatedAt"),
         COALESCE(i.last_item,    u."updatedAt")
       ) < $1
   AND NOT EXISTS (SELECT 1 FROM auth.employees      e  WHERE e.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM auth.sessions       si WHERE si."impersonatedBy" = u.id)
   AND NOT EXISTS (SELECT 1 FROM orders.orders       o  WHERE o.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM payments.intents    pi WHERE pi.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM payments.details    pd WHERE pd.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM payments.ledger     pl WHERE pl.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM media.images        mi WHERE mi.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM media.emails        me WHERE me.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM reviews.reviews     r  WHERE r.user_id = u.id)
 ORDER BY last_seen
 LIMIT $2
