-- One user, by id. Aliased to snake_case since auth.users keeps better-auth's
-- camelCase column names and this API's wire is snake_case; quoted because
-- unquoted `createdAt` would fold to `createdat`.
-- dorado_funds IS projected here too: the single-user read is the one an
-- admin opens to adjust a balance, so it is the read most in need of it.
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
 WHERE u.id = $1
