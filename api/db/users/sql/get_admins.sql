-- The admin users. ORDER BY name DESC, id DESC, which looks like a mistake
-- and is what the admin list has always shown.
SELECT u.id,
       u.email,
       u.name,
       u.phone_number,
       u."createdAt"     AS created_at,
       u."updatedAt"     AS updated_at,
       u."emailVerified" AS email_verified,
       u.image,
       u.role,
       u.dorado_funds,
       u."isAnonymous"
  FROM auth.users u
 WHERE u.role = 'admin'
 ORDER BY u.name DESC, u.id DESC
