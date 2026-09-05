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
    SELECT max(i.updated_at) AS last_item
      FROM checkout.checkouts c
      JOIN checkout.items i ON i.checkout_id = c.id
     WHERE c.user_id = u.id
  ) i ON true
 WHERE u."isAnonymous"
   AND GREATEST(
         u."updatedAt",
         COALESCE(s.last_session, u."updatedAt"),
         COALESCE(i.last_item,    u."updatedAt")
       ) < $1
 ORDER BY last_seen
 LIMIT $2
