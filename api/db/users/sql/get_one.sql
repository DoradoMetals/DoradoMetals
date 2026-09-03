-- One user, by id.
--
-- ALIASED TO snake_case. auth.users keeps better-auth's camelCase column names
-- and this API's wire is snake_case, so the aliases are what make the response
-- readable next to every other row shape. Unquoted, `createdAt` would fold to
-- `createdat` and not exist.
--
-- dorado_funds IS projected, where it used to be projected only by get_all and
-- get_admins. That asymmetry was inherited from an implementation this replaced
-- and had no reason behind it: the single-user read is the one an admin opens
-- to adjust a balance, so it is the read most in need of the balance.
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
