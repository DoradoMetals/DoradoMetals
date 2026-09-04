-- A VISITOR AND EVERYTHING THAT POINTS AT ONE, in one statement.
--
-- ONE STATEMENT ON PURPOSE. Every foreign key onto auth.users is NO ACTION
-- (not RESTRICT), which in Postgres means the referential check is an AFTER
-- ROW trigger queued to the END OF THE STATEMENT - so the referencing rows
-- deleted by these CTEs are already gone by the time the check on auth.users
-- runs. Split across five statements this would need an exact order and would
-- leave a half-deleted visitor behind on any failure; as one statement it is
-- all-or-nothing whether or not the caller opened a transaction.
--
-- WHAT IS NOT HERE, and why:
--   checkout.items         - ON DELETE CASCADE from checkout.checkouts.
--   places.addresses       - an address is SHARED (places.user_addresses is the
--                            join, and addresses/sql/is_referenced.sql exists
--                            because of it). The visitor's LINK goes; the
--                            address itself is not the visitor's to delete.
--   exchange.*             - a visitor never reaches it. Migration 122's two
--                            mirror guards are what make that true.
--   orders, payments, payouts, ledger
--                          - unreachable: `place` and the payout step refuse an
--                            anonymous subject, so no such row can exist. If one
--                            somehow does, its foreign key raises 23503 and this
--                            statement deletes NOTHING - which is the answer we
--                            want, loudly, rather than a cascade through money.
--
-- THE `AND "isAnonymous"` IS THE SAFETY. It is what makes the only DELETE of a
-- user row in this codebase incapable of touching a customer, whatever id the
-- caller passes.
WITH victims AS (
  SELECT id FROM auth.users
   WHERE id = ANY($1::uuid[])
     AND "isAnonymous"
),
dead_checkouts AS (
  DELETE FROM checkout.checkouts
   WHERE user_id IN (SELECT id FROM victims)
  RETURNING id
),
dead_book AS (
  DELETE FROM places.user_addresses
   WHERE user_id IN (SELECT id FROM victims)
  RETURNING id
),
dead_sessions AS (
  DELETE FROM auth.sessions
   WHERE "userId" IN (SELECT id FROM victims)
  RETURNING id
),
dead_accounts AS (
  DELETE FROM auth.account
   WHERE "userId" IN (SELECT id FROM victims)
  RETURNING id
)
DELETE FROM auth.users
 WHERE id IN (SELECT id FROM victims)
RETURNING id
