-- Every user, with their credit balance.
SELECT u.id,
       u.email,
       u.name,
       u.phone_number,
       u."createdAt"     AS created_at,
       u."updatedAt"     AS updated_at,
       u."emailVerified" AS email_verified,
       u.image,
       u.role,
       u.dorado_funds
  FROM auth.users u
 ORDER BY u.role, u.id
