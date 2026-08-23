-- Keeps auth.users in step with exchange.users, from inside the database.
--
-- Every other feature mirrors in JavaScript, because our code owns the write.
-- Auth is the exception: better-auth is configured with
-- `modelName: 'exchange.users'` and writes through its OWN pg Pool - not #db,
-- not the shared executor, not any repo. Signups, profile edits, verification
-- and bans all land in exchange.users without passing through a line of our
-- code, so there is no function to wrap and no mirror to call.
--
-- That is why auth has been written up as unmigratable. It is not: it is
-- unmigratable *in JavaScript*. A trigger sits below better-auth's pool and
-- sees the write regardless of who made it.
--
-- What this buys: features/users can be split behind USERS_SOURCE like every
-- other feature, reading auth.users while better-auth carries on owning
-- exchange.users. The `dual` state for auth is therefore "our reads move, the
-- database keeps the copy honest" rather than "our code writes twice".
--
-- What it does NOT cover: exchange.session, exchange.account and
-- exchange.verification. Those stay better-auth's, and moving them is still an
-- atomic cutover. They hold session mechanics rather than business data - the
-- worst case there is everyone gets logged out.
--
-- exchange is never modified. The trigger reads NEW and writes auth.users.
--
-- Reversible: DROP TRIGGER mirror_users_to_auth ON exchange.users;

CREATE OR REPLACE FUNCTION auth.mirror_user_from_exchange()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO auth.users (
    id, email, name, "createdAt", "updatedAt", "emailVerified",
    image, role, "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires"
  )
  VALUES (
    NEW.id, NEW.email, NEW.name, NEW."createdAt", NEW."updatedAt", NEW."emailVerified",
    NEW.image, NEW.role, NEW."stripeCustomerId", NEW.dorado_funds, NEW.banned, NEW."banReason", NEW."banExpires"
  )
  ON CONFLICT (id) DO UPDATE SET
    email             = EXCLUDED.email,
    name              = EXCLUDED.name,
    "createdAt"       = EXCLUDED."createdAt",
    "updatedAt"       = EXCLUDED."updatedAt",
    "emailVerified"   = EXCLUDED."emailVerified",
    image             = EXCLUDED.image,
    role              = EXCLUDED.role,
    "stripeCustomerId" = EXCLUDED."stripeCustomerId",
    dorado_funds      = EXCLUDED.dorado_funds,
    banned            = EXCLUDED.banned,
    "banReason"       = EXCLUDED."banReason",
    "banExpires"      = EXCLUDED."banExpires";

  RETURN NEW;

-- A failed mirror must never break a signup.
--
-- This trigger runs inside better-auth's transaction. If it raised, the user's
-- registration would fail - and while USERS_SOURCE is `exchange`, which is the
-- default and where it stays until someone promotes it, auth.users is not read
-- by anything at all. A stale mirror costs nothing; a broken signup costs a
-- customer. The warning goes to the Postgres log so the failure is findable.
--
-- Once promoted this trade-off inverts, and re-running the 029 backfill
-- reconciles anything the mirror dropped.
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auth.users mirror failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Deliberately AFTER, not BEFORE: the row is already committed to exchange by
-- the time this runs, so a mirror problem cannot affect what exchange stores.
DROP TRIGGER IF EXISTS mirror_users_to_auth ON exchange.users;
CREATE TRIGGER mirror_users_to_auth
  AFTER INSERT OR UPDATE ON exchange.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.mirror_user_from_exchange();
