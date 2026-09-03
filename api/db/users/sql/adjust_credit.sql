-- Move a customer's credit balance. THE ONE WRITE THIS FEATURE MAKES.
--
-- *** exchange.users, NOT auth.users, AND THAT IS NOT LEGACY. ***
--
-- Everywhere else on this project `exchange` is the shadow and a namespaced
-- schema is the thing being fed. Here the direction is inverted: exchange.users
-- carries the `mirror_users_to_auth` trigger (migration 056), which copies the
-- WHOLE row into auth.users on every INSERT or UPDATE. So exchange is the
-- source and auth.users is the mirror, maintained by Postgres.
--
-- Writing auth.users instead is not merely redundant, it LOSES MONEY, and this
-- was measured rather than reasoned about (docs/waves/seams.md, seam 2). The
-- trigger's ON CONFLICT DO UPDATE sets `dorado_funds = EXCLUDED.dorado_funds`,
-- and EXCLUDED comes from exchange's row - so any later better-auth UPDATE, for
-- any reason at all (a profile edit, a ban, the stripeCustomerId written on
-- signup, an emailVerified flip), reverts a balance written only to auth.users.
-- A $1000 credit disappeared on an `updatedAt` touch, with no error raised.
--
-- Reversing the direction is not a code change: better-auth is configured with
-- `modelName: 'exchange.users'` and writes through its OWN pg Pool, so nothing
-- in this application is on that path. That is the auth cutover, and it is
-- Jacob's.
--
-- THE CASE HAS NO ELSE, and that is load-bearing: an unrecognised mode
-- evaluates to NULL, and dorado_funds is NOT NULL, so Postgres raises 23502 and
-- writes nothing rather than wiping a balance. The service also refuses an
-- unknown mode; this is the backstop underneath it, and it is the reason
-- audit:constraints exists. Migration 080 gives auth.users the same NOT NULL so
-- the mirror cannot be the weaker copy.
UPDATE exchange.users
   SET dorado_funds = CASE
         WHEN $2 = 'add'      THEN COALESCE(dorado_funds, 0) + $1
         WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
         WHEN $2 = 'edit'     THEN $1
       END
 WHERE id = $3
-- RETURNING, so the caller does not have to read the row again to learn what it
-- became. The drawer displays this number; before D98 it displayed the one the
-- browser had computed, which is the same class of mistake as computing it.
RETURNING dorado_funds
