-- Catches auth.users up with exchange.users.
--
-- 056's trigger keeps the two in step from the moment it is installed. It does
-- nothing about the gap that already exists, and there is one: 029 backfilled
-- auth.users during the January work, and every user who signed up after that
-- went into exchange.users and nowhere else.
--
--   dev         10 users in exchange, 9 in auth   - 1 missing
--   production  74 users in exchange, 60 in auth  - 14 missing
--
-- Fourteen people in production have an account the new schema has never heard
-- of. Reading auth.users without closing that gap would mean they simply do not
-- appear on the admin screens - not an error, just absent, which is the worst
-- way for it to fail.
--
-- Found by `diff users` reporting 10 rows against 9 after the feature was
-- split. A row count is the one thing that comparison is good at.
--
-- Idempotent: keyed on id, and re-running only refreshes. Safe to run again at
-- any point before promotion, and worth doing immediately before it - anything
-- that slips between this migration and the trigger being live is caught by
-- running it once more.
--
-- exchange is only read from.

INSERT INTO auth.users (
  id, email, name, "createdAt", "updatedAt", "emailVerified",
  image, role, "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires"
)
SELECT
  e.id, e.email, e.name, e."createdAt", e."updatedAt", e."emailVerified",
  e.image, e.role, e."stripeCustomerId", e.dorado_funds, e.banned, e."banReason", e."banExpires"
FROM exchange.users e
-- Skips any user whose email is already held in auth.users under a DIFFERENT
-- id, because auth.users has a unique index on email and the insert would abort
-- the whole migration on one row.
--
-- dev has exactly one: exchange user fb6d99bb (created 2025-12-15) and auth
-- user 9f53898e (created 2026-01-14) share an email. The January work inserted
-- a second row for the same person rather than carrying the id across - the
-- same re-keying that produced the address snapshots, except email being unique
-- makes it visible here. The duplicate is referenced by an auth.sessions and an
-- auth.account row, so it is not free-floating and is not deleted here.
--
-- PRODUCTION HAS NONE: 0 collisions, 14 users needing catch-up, 0 auth rows
-- exchange does not have. So this clause is inert where it matters and stops a
-- dev artifact from blocking the migration everywhere else.
--
-- A skipped user is invisible on the admin screens once USERS_SOURCE is
-- promoted. `diff users` reports it as a row-count difference, which is how
-- this was found in the first place.
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users a WHERE a.email = e.email AND a.id <> e.id
)
ON CONFLICT (id) DO UPDATE SET
  email              = EXCLUDED.email,
  name               = EXCLUDED.name,
  "createdAt"        = EXCLUDED."createdAt",
  "updatedAt"        = EXCLUDED."updatedAt",
  "emailVerified"    = EXCLUDED."emailVerified",
  image              = EXCLUDED.image,
  role               = EXCLUDED.role,
  "stripeCustomerId" = EXCLUDED."stripeCustomerId",
  dorado_funds       = EXCLUDED.dorado_funds,
  banned             = EXCLUDED.banned,
  "banReason"        = EXCLUDED."banReason",
  "banExpires"       = EXCLUDED."banExpires";
