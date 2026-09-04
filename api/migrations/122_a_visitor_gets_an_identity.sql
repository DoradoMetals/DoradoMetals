-- A VISITOR GETS AN IDENTITY (ruling 63: "Fuck it, go for it. We'll need it
-- anyway." / "Frontend stores should be for UI elements, not data.").
--
-- better-auth's `anonymous` plugin mints a real auth.users row on the first
-- basket touch, so a signed-out visitor's checkout is an ORDINARY row under an
-- ordinary user id: the same tables, the same rates, the same readiness. The
-- plugin's own schema declares ONE field for it - `isAnonymous`, boolean,
-- required false, input false, default false (better-auth 1.6.9,
-- dist/plugins/anonymous/schema.mjs) - and better-auth never migrates our
-- database, so the column is added here.
--
-- THREE FUNCTIONS ARE REDEFINED BELOW, and each one is a hazard this column
-- closes rather than a tidy-up:
--
--   1. auth.mirror_identity_to_exchange (107). It copies every new auth.users
--      row into exchange.users. A visitor is not a customer and has no
--      business in the frozen schema - and every visitor that ever opened the
--      site would land there permanently, because ruling 36 froze exchange
--      against DELETES too. Anonymous rows stop at the door.
--
--   2. auth.mirror_session_to_exchange (108). It copies sessions the same way,
--      and exchange.session."userId" is a foreign key onto exchange.users - so
--      with (1) in place an anonymous sign-in would raise 23503 and the
--      visitor could not get a session at all. The two guards are one change;
--      splitting them breaks the site.
--
--   3. public.audit_stamp (116). It resolves `app.actor_id` against auth.users
--      and stamps created_by_id / updated_by_id, which are foreign keys onto
--      auth.users. A visitor's draft fulfillment would therefore POINT AT the
--      anonymous user, and the sweep that eventually deletes that user would
--      raise 23503 forever after. It is also the honest answer: a visitor with
--      no account authored nothing anyone can be shown. An anonymous actor now
--      resolves to nobody, exactly like an unauthenticated request or a cron
--      sweep, and the row reads as system-authored.
--
-- exchange is READ by nothing here and WRITTEN by nothing new: (1) and (2) only
-- gain an early RETURN, so strictly fewer exchange rows are written than before.
-- No exchange table, column, row or constraint is touched.
--
-- Reversible: re-run 107's and 108's function bodies and 116's audit_stamp, then
--   ALTER TABLE auth.users DROP COLUMN "isAnonymous";
-- Dropping the column while the anonymous plugin is configured breaks sign-in,
-- so the config half (domain/auth/client.ts) comes back with it.

-- ------------------------------------------------------------------ the column
--
-- NOT NULL DEFAULT false: every existing row is a real account, and the plugin
-- passes isAnonymous: true explicitly on the one path that creates a visitor.
-- A boolean that can be null would make every guard below a three-way question.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS "isAnonymous" boolean NOT NULL DEFAULT false;

-- The sweep's access path: "anonymous users last touched before <cutoff>".
-- PARTIAL, because real accounts are the overwhelming majority and none of
-- them is ever a candidate - the index holds only visitors.
CREATE INDEX IF NOT EXISTS users_anonymous_stale_idx
  ON auth.users ("updatedAt")
  WHERE "isAnonymous";

-- ------------------------------------------------- 1. the identity mirror
-- 107's function, with one guard added. Everything else is byte-for-byte its.
CREATE OR REPLACE FUNCTION auth.mirror_identity_to_exchange()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  -- A VISITOR IS NOT A CUSTOMER. An anonymous row never reaches exchange, and
  -- an anonymous user never becomes a real one: signing up mints a SECOND user
  -- and links to it (better-auth's anonymous plugin), so there is no
  -- false -> true or true -> false transition to catch up on.
  IF COALESCE(NEW."isAnonymous", false) THEN RETURN NEW; END IF;
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
    -- dorado_funds DELIBERATELY absent: 118 made auth the owner and this side
    -- has never written it. The INSERT above seeds a NEW user's balance at 0.
  RETURN NEW;
END;
$$;

-- -------------------------------------------------- 2. the session mirror
-- 108's function, with the matching guard. Without it, (1) turns every
-- anonymous sign-in into a foreign-key violation on exchange.session.
CREATE OR REPLACE FUNCTION auth.mirror_session_to_exchange()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  anon boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  SELECT COALESCE(u."isAnonymous", false) INTO anon
    FROM auth.users u WHERE u.id = NEW."userId";
  -- No exchange.users row exists for a visitor, and exchange.session."userId"
  -- points at one. A visitor's session lives only in auth.sessions.
  IF COALESCE(anon, false) THEN RETURN NEW; END IF;
  INSERT INTO exchange.session (
    id, "userId", token, "expiresAt", "ipAddress", "userAgent",
    "createdAt", "updatedAt", "impersonatedBy"
  )
  VALUES (
    NEW.id, NEW."userId", NEW.token, NEW."expiresAt", NEW."ipAddress",
    NEW."userAgent", NEW."createdAt", NEW."updatedAt", NEW."impersonatedBy"
  )
  ON CONFLICT (id) DO UPDATE SET
    token = EXCLUDED.token, "expiresAt" = EXCLUDED."expiresAt",
    "updatedAt" = EXCLUDED."updatedAt", "impersonatedBy" = EXCLUDED."impersonatedBy";
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------- 3. the audit stamp
-- 116's function, with ONE clause added to the actor lookup. The body is
-- otherwise unchanged; see 116 for why each part is the way it is.
CREATE OR REPLACE FUNCTION public.audit_stamp() RETURNS trigger
LANGUAGE plpgsql
AS $audit_stamp$
DECLARE
  cols        jsonb;        -- {column_name: type} for the six, as this table has them
  before      jsonb;        -- NEW, readable without raising on an absent column
  patch       jsonb := '{}'::jsonb;
  raw         text;
  actor       uuid;
  actor_name  text;
  stamp       timestamptz := clock_timestamp();
  created_ts  timestamptz;
  updated_ts  timestamptz;
BEGIN
  SELECT jsonb_object_agg(a.attname, t.typname) INTO cols
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE a.attrelid = TG_RELID
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN ('created_at', 'updated_at', 'created_by',
                       'updated_by', 'created_by_id', 'updated_by_id');
  IF cols IS NULL THEN RETURN NEW; END IF;

  -- The actor, resolved to a real user or to nobody. The regex is what keeps a
  -- malformed setting from raising 22P02 on every write; the lookup is what
  -- keeps an id with no user from raising 23503 on the foreign key.
  --
  -- AN ANONYMOUS VISITOR IS NOBODY (122). Every *_by_id column is a foreign key
  -- onto auth.users, so attributing a row to a visitor would pin that visitor's
  -- row in place for the life of the row it stamped - and the sweep that
  -- deletes stale visitors would raise 23503 instead. It is also true: nobody
  -- can be shown "created by Anonymous" and learn anything.
  raw := nullif(current_setting('app.actor_id', true), '');
  IF raw ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
    SELECT u.id, u.name INTO actor, actor_name
      FROM auth.users u
     WHERE u.id = raw::uuid
       AND NOT COALESCE(u."isAnonymous", false);
  END IF;

  before := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    created_ts := coalesce((before->>'created_at')::timestamptz, stamp);
    updated_ts := coalesce((before->>'updated_at')::timestamptz, created_ts);
    IF cols ? 'created_at' THEN
      patch := patch || jsonb_build_object('created_at', created_ts);
    END IF;
    IF cols ? 'updated_at' THEN
      patch := patch || jsonb_build_object('updated_at', updated_ts);
    END IF;

    -- An explicitly supplied author wins on INSERT: a seed or a script that
    -- says who made the row is recording a fact this function does not know.
    IF cols ? 'created_by_id' AND before->>'created_by_id' IS NULL AND actor IS NOT NULL THEN
      patch := patch || jsonb_build_object('created_by_id', actor);
    END IF;
    IF cols ? 'updated_by_id' AND before->>'updated_by_id' IS NULL AND actor IS NOT NULL THEN
      patch := patch || jsonb_build_object('updated_by_id', actor);
    END IF;

    IF cols->>'created_by' = 'uuid' THEN
      IF before->>'created_by' IS NULL AND actor IS NOT NULL THEN
        patch := patch || jsonb_build_object('created_by', actor);
      END IF;
    ELSIF cols ? 'created_by' AND actor_name IS NOT NULL THEN
      patch := patch || jsonb_build_object('created_by', actor_name);
    END IF;

    IF cols->>'updated_by' = 'uuid' THEN
      IF before->>'updated_by' IS NULL AND actor IS NOT NULL THEN
        patch := patch || jsonb_build_object('updated_by', actor);
      END IF;
    ELSIF cols ? 'updated_by' AND actor_name IS NOT NULL THEN
      patch := patch || jsonb_build_object('updated_by', actor_name);
    END IF;

  ELSE
    -- UPDATE. created_at and created_by* are never touched: they are facts
    -- about a moment that has already passed.
    IF cols ? 'updated_at' THEN
      patch := patch || jsonb_build_object('updated_at', stamp);
    END IF;
    IF cols ? 'updated_by_id' AND actor IS NOT NULL THEN
      patch := patch || jsonb_build_object('updated_by_id', actor);
    END IF;
    IF cols->>'updated_by' = 'uuid' THEN
      IF actor IS NOT NULL THEN
        patch := patch || jsonb_build_object('updated_by', actor);
      END IF;
    ELSIF cols ? 'updated_by' AND actor_name IS NOT NULL THEN
      patch := patch || jsonb_build_object('updated_by', actor_name);
    END IF;
  END IF;

  IF patch = '{}'::jsonb THEN RETURN NEW; END IF;
  RETURN jsonb_populate_record(NEW, patch);
END;
$audit_stamp$;
