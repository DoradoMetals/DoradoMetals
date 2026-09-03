-- One user, by id.
--
-- ALIASED TO snake_case. auth.users keeps better-auth's camelCase column names
-- and the wire has always been snake_case, so the aliases are what keep the
-- response identical - not a tidy-up. Unquoted, `createdAt` would fold to
-- `createdat` and not exist.
--
-- phone_number is NOT projected: auth.users has it, exchange.users does not,
-- and it has never been on this wire.
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
