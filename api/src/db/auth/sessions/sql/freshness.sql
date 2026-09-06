SELECT u.banned,
       u."banExpires" AS ban_expires,
       u.role
  FROM auth.sessions s
  JOIN auth.users u ON u.id = s."userId"
 WHERE s.id = $1
