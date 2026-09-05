-- THE LAST TWO WRITES INTO exchange STOP (Jacob, 2026-09-06: "Yes migrate and
-- retire").
--
-- D214 recorded that no application STATEMENT names an exchange table in an
-- INSERT, UPDATE or DELETE, and that what still reached exchange was two mirror
-- TRIGGERS fed from auth.*:
--
--   mirror_identity_to_exchange_insert / _update  on auth.users     (107, 118)
--   mirror_sessions_to_exchange                   on auth.sessions  (108)
--
-- They existed for one reason: features that JOINED exchange.users for a name,
-- an email or a role had to keep seeing fresh identity, and exchange.session
-- had to keep accepting a login because exchange.payment_intents.session_id is
-- a foreign key onto it. Neither reason survives. Grepped 2026-09-06 across
-- api/ excluding migrations, tests, scripts/lib/feature-map.ts and the test-db
-- preflight: `exchange.users`, `exchange.session` and `exchange."session"`
-- appear in ZERO application files - not in db/, domain/, transport/, or any
-- feature root. The only remaining hits were tooling (the two e2e seeds and
-- audit-payments, all repointed at auth.users in this same pass) and comments.
--
-- WHAT THIS COSTS, stated plainly. exchange.users' identity columns and
-- exchange.session stop changing from today. Every row they hold stays, and
-- stays readable forever; a login simply lands only in auth.sessions, and a new
-- customer lands only in auth.users. A stale session is a re-login, not lost
-- data (108's own header says so), and identity has had exactly one owner since
-- the 107 cutover - auth.users - so nothing here can lose a value that is not
-- already written somewhere else first.
--
-- exchange IS NOT TOUCHED. No table, column, row, constraint or index in it is
-- read, written, altered or dropped by this file. Only two triggers on auth.*
-- and the two functions they called are removed. This is ruling 36 finishing:
-- "Yes exchange can stop receiving those writes."
--
-- Reversible: re-run 107's and 108's function bodies as 122 redefined them
-- (122 is where the anonymous-visitor guards live, and it is the version to
-- restore, not 107's or 108's original), then
--
--   CREATE TRIGGER mirror_identity_to_exchange_insert
--     AFTER INSERT ON auth.users FOR EACH ROW
--     EXECUTE FUNCTION auth.mirror_identity_to_exchange();
--   CREATE TRIGGER mirror_identity_to_exchange_update
--     AFTER UPDATE OF email, name, "emailVerified", image, role,
--                     "stripeCustomerId", banned, "banReason", "banExpires",
--                     "updatedAt"
--     ON auth.users FOR EACH ROW
--     EXECUTE FUNCTION auth.mirror_identity_to_exchange();
--   CREATE TRIGGER mirror_sessions_to_exchange
--     AFTER INSERT OR UPDATE ON auth.sessions FOR EACH ROW
--     EXECUTE FUNCTION auth.mirror_session_to_exchange();
--
-- Rows written to auth.* while the triggers were gone would not be caught up by
-- that alone; 057's catch-up backfill is the shape of the statement that would.
--
-- exchange.mirror_funds_to_auth() is DELIBERATELY left in place. 118 dropped
-- its trigger, so it fires for nothing, and it lives in the exchange schema
-- where this project does not delete things on tidiness grounds.

DROP TRIGGER IF EXISTS mirror_identity_to_exchange_insert ON auth.users;
DROP TRIGGER IF EXISTS mirror_identity_to_exchange_update ON auth.users;
-- 118 split the trigger in two; a database that never ran 118 still carries the
-- single AFTER INSERT OR UPDATE trigger under 107's original name.
DROP TRIGGER IF EXISTS mirror_identity_to_exchange ON auth.users;

DROP TRIGGER IF EXISTS mirror_sessions_to_exchange ON auth.sessions;

-- The functions go with the triggers: nothing else calls either one, and a
-- SECURITY DEFINER function that writes a frozen schema is not something to
-- leave loaded and unfired.
DROP FUNCTION IF EXISTS auth.mirror_identity_to_exchange();
DROP FUNCTION IF EXISTS auth.mirror_session_to_exchange();

DO $$
DECLARE
  left_over integer;
BEGIN
  SELECT count(*) INTO left_over
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'auth'
     AND t.tgname IN ('mirror_identity_to_exchange',
                      'mirror_identity_to_exchange_insert',
                      'mirror_identity_to_exchange_update',
                      'mirror_sessions_to_exchange');
  IF left_over > 0 THEN
    RAISE EXCEPTION 'the auth -> exchange mirrors are still installed: % trigger(s)', left_over;
  END IF;
END $$;
