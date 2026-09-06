-- Passwordless, phone-first auth (ruling 91): the code is the only key.
--
-- Every route ends in a one-time code, so the phone becomes an identity the
-- database has to be able to verify, rate-limit and lock - and none of those
-- three facts had anywhere to live. `auth.users.phone_number` existed from
-- genesis and nothing said whether it had ever been proved.
--
-- WHAT THIS ADDS, and why each one is a column rather than a cache:
--
--   phone_number_verified. A phone that has answered a code is a second
--   factor; one that was merely typed in is a string. Without the flag the two
--   are indistinguishable, and the change flow would send a code to an
--   unproved number.
--
--   users_one_phone_number. A phone identifies an account on sign-in, so two
--   accounts holding the same number is an ambiguity the sign-in read cannot
--   resolve. Partial, because NULL is the normal state for every account that
--   has not added one - a plain UNIQUE would be right too, but the predicate
--   says out loud that absence is not a collision. Dev holds 17 users and zero
--   phone numbers, so the index is created against no existing rows.
--
--   otp_throttles. ONE table for the lockout fact and both send limits, keyed
--   by `subject` - 'phone:+1...', 'email:...' or 'ip:...'. Three tables would
--   have been three places to forget a window reset; the subject prefix is
--   what keeps a phone limit and an IP limit from sharing a row, and `kind`
--   is the same fact typed, so a read can group by it. `sends` plus
--   `window_started_at` is the SMS-pumping limit, `attempts` plus
--   `locked_until` is the wrong-code lockout, and both belong to the identity
--   being verified rather than to a session, which is the point: a lockout a
--   new session clears is not a lockout.
--
--   pending_changes. A factor change is asserted first and confirmed second,
--   because the code that confirms it is sent to the OTHER factor. Between
--   those two requests the new value has to be somewhere that is not the user
--   row - writing it early would change the account before it was proved.
--   `verified_via` and `sent_to` record which channel carried the code, so the
--   confirmation cannot be replayed against a channel the customer did not
--   receive. The partial unique index allows exactly ONE open change per user;
--   a confirmed row keeps its place in the trail.
--
--   pending_signups. A sign-up collects name, email and phone BEFORE any user
--   row exists and the code goes to the phone, so the three values have to
--   survive between the send and the verify. Nothing here references
--   auth.users - the user is what the verify creates. `phone_number` is unique
--   so a second sign-up attempt on the same number reuses the row rather than
--   racing it.
--
--   sessions.factor_changed. One factor per session (rule 5): a session that
--   changed the email may not go on to change the phone. The fact belongs to
--   the session, so it is a column on the session.
--
--   sessions.stepped_up_at. Step-up freshness is a session fact. A session is
--   fresh when greatest("createdAt", coalesce(stepped_up_at, "createdAt")) is
--   inside the window; without this column a successful step-up could not make
--   a stale session fresh and the change flow would ask for one forever.
--
-- THE AUDIT TRIGGER IS INSTALLED ON THE TWO NEW TABLES, and 116 excluded
-- `auth.*` on purpose - those tables are better-auth's, written through its own
-- pool with its own camelCase column names. otp_throttles, pending_changes and
-- pending_signups are OURS: snake_case, four audit columns, written by our
-- repos through withTransaction. An unauthenticated OTP send stamps no actor,
-- which is the truth about it.
--
-- Purely additive. `exchange` is neither read nor written. No password row in
-- `auth.account` is deleted - the credential provider simply stops being
-- configured, and the rows sit there unread.
--
-- ROLLBACK: DROP TABLE auth.pending_signups, auth.pending_changes,
-- auth.otp_throttles; DROP INDEX auth.users_one_phone_number; ALTER TABLE
-- auth.users DROP COLUMN phone_number_verified; ALTER TABLE auth.sessions DROP
-- COLUMN factor_changed, DROP COLUMN stepped_up_at; DROP TYPE
-- auth.otp_purpose, auth.throttle_kind, auth.factor, auth.otp_channel. Every
-- one of those touches only rows this migration created.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'otp_channel' AND n.nspname = 'auth'
  ) THEN
    CREATE TYPE auth.otp_channel AS ENUM ('sms', 'email');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'factor' AND n.nspname = 'auth'
  ) THEN
    CREATE TYPE auth.factor AS ENUM ('email', 'phone');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'otp_purpose' AND n.nspname = 'auth'
  ) THEN
    CREATE TYPE auth.otp_purpose AS ENUM ('sign_in', 'sign_up', 'step_up', 'change_email', 'change_phone');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'throttle_kind' AND n.nspname = 'auth'
  ) THEN
    CREATE TYPE auth.throttle_kind AS ENUM ('phone', 'email', 'ip');
  END IF;
END $$;

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS phone_number_verified boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_phone_number
  ON auth.users (phone_number)
  WHERE phone_number IS NOT NULL;

ALTER TABLE auth.sessions
  ADD COLUMN IF NOT EXISTS factor_changed auth.factor,
  ADD COLUMN IF NOT EXISTS stepped_up_at timestamptz;

CREATE TABLE IF NOT EXISTS auth.otp_throttles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject           text NOT NULL UNIQUE,
  kind              auth.throttle_kind NOT NULL,
  sends             integer NOT NULL DEFAULT 0,
  window_started_at timestamptz,
  attempts          integer NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  last_sent_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by_id     uuid REFERENCES auth.users(id),
  updated_by_id     uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS auth.pending_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  factor        auth.factor NOT NULL,
  next_value    text NOT NULL,
  verified_via  auth.otp_channel NOT NULL,
  sent_to       text NOT NULL,
  expires_at    timestamptz NOT NULL,
  confirmed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_changes_one_open_per_user
  ON auth.pending_changes (user_id)
  WHERE confirmed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth.pending_signups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  text NOT NULL UNIQUE,
  email         text NOT NULL,
  name          text NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS pending_signups_email ON auth.pending_signups (email);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON auth.otp_throttles
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON auth.pending_changes
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON auth.pending_signups
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
