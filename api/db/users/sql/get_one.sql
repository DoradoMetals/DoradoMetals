-- One user, by id. Aliased to snake_case since auth.users keeps better-auth's camelCase columns and the wire is snake_case; quoted because unquoted `createdAt` folds to `createdat`.
-- phone_number is NOT projected - it's never been on this wire.
SELECT u.id,
       u.email,
       u.name,
       u."createdAt"     AS created_at,
       u."updatedAt"     AS updated_at,
       u."emailVerified" AS email_verified,
       u.image,
       u.role
  FROM auth.users u
 WHERE u.id = $1
