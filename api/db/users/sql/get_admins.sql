-- The admin users. ORDER BY name DESC, id DESC - descending looks like a mistake but is what the admin list shows today.
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
 WHERE u.role = 'admin'
 ORDER BY u.name DESC, u.id DESC
