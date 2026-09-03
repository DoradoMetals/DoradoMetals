-- Every user, with their credit balance. dorado_funds is projected here and NOT by get_one, preserved deliberately - changing which reads carry a balance changes what an admin screen shows.
SELECT u.id,
       u.email,
       u.name,
       u."createdAt"     AS created_at,
       u."updatedAt"     AS updated_at,
       u."emailVerified" AS email_verified,
       u.image,
       u.role,
       u.dorado_funds
  FROM auth.users u
 ORDER BY u.role, u.id
