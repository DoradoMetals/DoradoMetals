-- THE AUTH CUTOVER. better-auth stops writing exchange and starts writing
-- auth.* - the atomic flip CLAUDE.md reserved for Jacob, executed on his
-- instruction (2026-09-01). The config half is features/auth/client.ts in the
-- same commit; this migration makes the tables ready and reverses the mirror.
--
-- Reversible: run the block at the bottom of this file's comments - drop the
-- two triggers here, recreate 056's mirror_users_to_auth, and point client.ts
-- back at exchange.*. Sessions minted while flipped die with the flip-back,
-- which logs those browsers out and loses nothing else.
--
-- Backup taken first: 238 rows across all eight tables, CSV per table
-- (session scratchpad auth-backup/), before anything below ran.

-- ---------------------------------------------------------------- 1. ghosts
-- auth.users holds two rows from the abandoned January refactor that exist
-- nowhere in exchange: test+mikro@dorado.local (49210e7e) and a January
-- signup for jtj2197@gmail.com (9f53898e) whose LIVE account is a different
-- id (fb6d99bb) in exchange. auth.users is UNIQUE(email), so the live row
-- cannot land while the ghost sits on its email - and worse, at cutover a
-- ghost with a credential row becomes a loginable account with a
-- January-era password. They go, credentials and sessions first.
DELETE FROM auth.sessions WHERE "userId" IN
  ('49210e7e-b731-49ab-9649-af91acc7961b', '9f53898e-e0da-4347-ab27-b6a8dd4a5694');
DELETE FROM auth.account WHERE "userId" IN
  ('49210e7e-b731-49ab-9649-af91acc7961b', '9f53898e-e0da-4347-ab27-b6a8dd4a5694');
DELETE FROM auth.users WHERE id IN
  ('49210e7e-b731-49ab-9649-af91acc7961b', '9f53898e-e0da-4347-ab27-b6a8dd4a5694');

-- ------------------------------------------------------- 2. reconcile users
-- Full one-time resync from the table that has been authoritative all along.
INSERT INTO auth.users (
  id, email, name, "createdAt", "updatedAt", "emailVerified",
  image, role, "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires"
)
SELECT id, email, name, "createdAt", "updatedAt", "emailVerified",
       image, role, "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires"
FROM exchange.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, name = EXCLUDED.name,
  "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt",
  "emailVerified" = EXCLUDED."emailVerified", image = EXCLUDED.image,
  role = EXCLUDED.role, "stripeCustomerId" = EXCLUDED."stripeCustomerId",
  dorado_funds = EXCLUDED.dorado_funds, banned = EXCLUDED.banned,
  "banReason" = EXCLUDED."banReason", "banExpires" = EXCLUDED."banExpires";

-- ---------------------------------------------------- 3. reconcile sessions
-- Sessions are ephemeral - a lost one is a re-login, not lost data ("not all
-- data is equally precious"). The auth side is a stale partial copy that
-- never had a mirror; it is rebuilt wholesale from the live table.
DELETE FROM auth.sessions;
INSERT INTO auth.sessions (
  id, "userId", token, "expiresAt", "ipAddress", "userAgent",
  "createdAt", "updatedAt", "impersonatedBy"
)
SELECT id, "userId", token, "expiresAt", "ipAddress", "userAgent",
       "createdAt", "updatedAt", "impersonatedBy"
FROM exchange.session;

-- ------------------------------------- 4. reconcile credentials and tokens
INSERT INTO auth.account (
  id, "userId", "accountId", "providerId", "accessToken", "refreshToken",
  "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, "idToken",
  password, "createdAt", "updatedAt"
)
SELECT id, "userId", "accountId", "providerId", "accessToken", "refreshToken",
       "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, "idToken",
       password, "createdAt", "updatedAt"
FROM exchange.account
ON CONFLICT (id) DO UPDATE SET
  "userId" = EXCLUDED."userId", "accountId" = EXCLUDED."accountId",
  "providerId" = EXCLUDED."providerId", "accessToken" = EXCLUDED."accessToken",
  "refreshToken" = EXCLUDED."refreshToken",
  "accessTokenExpiresAt" = EXCLUDED."accessTokenExpiresAt",
  "refreshTokenExpiresAt" = EXCLUDED."refreshTokenExpiresAt",
  scope = EXCLUDED.scope, "idToken" = EXCLUDED."idToken",
  password = EXCLUDED.password,
  "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO auth.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
SELECT id, identifier, value, "expiresAt", "createdAt", "updatedAt"
FROM exchange.verification
ON CONFLICT (id) DO UPDATE SET
  identifier = EXCLUDED.identifier, value = EXCLUDED.value,
  "expiresAt" = EXCLUDED."expiresAt",
  "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt";

-- --------------------------------------------- 5. the mirror changes hands
-- 056's trigger made exchange.users the source and auth.users the copy - the
-- inversion that silently reverted a $1000 credit written auth-side. After
-- the flip the row has TWO owners, split by column:
--
--   identity (email, name, role, ban state, stripe customer) is better-auth's
--   and flows auth -> exchange, so every feature still joining exchange.users
--   keeps seeing fresh identity;
--
--   dorado_funds is the app's (features/users writes it, quotes spend it) and
--   flows exchange -> auth, so the session object the frontend reads shows
--   live credit.
--
-- Each trigger touches only the other's columns and both stand down inside
-- another trigger's write (pg_trigger_depth), so the pair cannot loop.
DROP TRIGGER IF EXISTS mirror_users_to_auth ON exchange.users;
DROP FUNCTION IF EXISTS auth.mirror_user_from_exchange();

CREATE OR REPLACE FUNCTION auth.mirror_identity_to_exchange()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  INSERT INTO exchange.users (
    id, email, name, "createdAt", "updatedAt", "emailVerified",
    image, role, "stripeCustomerId", dorado_funds, banned, "banReason", "banExpires"
  )
  VALUES (
    NEW.id, NEW.email, NEW.name, NEW."createdAt", NEW."updatedAt", NEW."emailVerified",
    NEW.image, NEW.role, NEW."stripeCustomerId", COALESCE(NEW.dorado_funds, 0),
    NEW.banned, NEW."banReason", NEW."banExpires"
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, name = EXCLUDED.name,
    "updatedAt" = EXCLUDED."updatedAt", "emailVerified" = EXCLUDED."emailVerified",
    image = EXCLUDED.image, role = EXCLUDED.role,
    "stripeCustomerId" = EXCLUDED."stripeCustomerId", banned = EXCLUDED.banned,
    "banReason" = EXCLUDED."banReason", "banExpires" = EXCLUDED."banExpires";
    -- dorado_funds DELIBERATELY absent: exchange owns it. The INSERT above
    -- seeds a NEW user's balance at 0; an existing row's balance is never
    -- touched from this side - that is the $1000 bug, direction-proofed.
  RETURN NEW;
END;
$$;

CREATE TRIGGER mirror_identity_to_exchange
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.mirror_identity_to_exchange();

CREATE OR REPLACE FUNCTION exchange.mirror_funds_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  UPDATE auth.users SET dorado_funds = NEW.dorado_funds WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mirror_funds_to_auth
  AFTER UPDATE OF dorado_funds ON exchange.users
  FOR EACH ROW
  WHEN (OLD.dorado_funds IS DISTINCT FROM NEW.dorado_funds)
  EXECUTE FUNCTION exchange.mirror_funds_to_auth();
