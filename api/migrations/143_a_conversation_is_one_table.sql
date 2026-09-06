-- A conversation is one table (rulings 92 and 93).
--
-- One business number now carries three things: the OTP texts auth sends, the
-- two-way messages a customer writes back, and the calls. The trail for all of
-- it lands in a new `crm` schema, which is the eighteenth this database has and
-- the first one added since genesis.
--
-- WHY ONE TABLE PER MEDIUM AND NOT ONE PER DIRECTION. `sms_messages` holds
-- inbound and outbound in the same rows, distinguished by a column, so reading
-- a conversation is one ordered SELECT rather than a merge of two tables in
-- TypeScript (ruling 71 - a view is one SQL read). The same argument makes the
-- OTP texts ordinary rows: a code sent to a customer is a message the business
-- sent, and hiding it in another table would make the log lie.
--
-- provider_sid IS THE IDEMPOTENCY KEY, and it is UNIQUE for that reason.
-- Twilio retries a webhook it did not get a 200 from, and a status callback can
-- arrive out of order; the unique constraint is what makes the replay a no-op
-- instead of a duplicate row. `provider` is beside it because the sid is only
-- unique within the provider that minted it.
--
-- user_id IS NULLABLE ON PURPOSE. A text from a number nobody has verified is
-- still a message the business received, and refusing it to protect a foreign
-- key would lose the only copy. It is matched by verified phone at write time
-- and stays null when there is no match.
--
-- employee_id ON calls is likewise nullable: an inbound call nobody answered
-- has no employee, and that is the case the voicemail path exists for.
--
-- THE INDEXES ARE THE LIVE READS, not decoration. `(user_id, created_at)` is
-- the customer conversation; `(from_number, created_at)` and
-- `(to_number, created_at)` are the same conversation keyed by a number for
-- someone who is not a user yet; `(user_id, started_at)` is the call history.
-- `audit:query-paths` asks whether an index LEADS with the column a WHERE
-- filters on, so a composite in the wrong order would report as no index at
-- all.
--
-- Both tables carry the four audit columns and the `audit_stamp` trigger from
-- 116. A webhook writes with no session, so those rows read as system-authored,
-- which is the truth about them.
--
-- Purely additive: a new schema, two new tables, four new enums. `exchange` is
-- neither read nor written and no existing table is touched.
--
-- ROLLBACK: DROP SCHEMA crm CASCADE. Nothing outside this file lives in it.

CREATE SCHEMA IF NOT EXISTS crm;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'sms_direction' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm.sms_direction AS ENUM ('inbound', 'outbound');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'sms_status' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm.sms_status AS ENUM ('received', 'queued', 'sent', 'delivered', 'failed', 'undelivered');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'call_direction' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm.call_direction AS ENUM ('inbound', 'outbound');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'call_status' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm.call_status AS ENUM ('queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled', 'voicemail');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm.sms_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction     crm.sms_direction NOT NULL,
  provider      text NOT NULL DEFAULT 'twilio',
  provider_sid  text NOT NULL UNIQUE,
  from_number   text NOT NULL,
  to_number     text NOT NULL,
  body          text,
  media         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        crm.sms_status NOT NULL,
  error_code    text,
  user_id       uuid REFERENCES auth.users(id),
  received_at   timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS sms_messages_user_created ON crm.sms_messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS sms_messages_from_created ON crm.sms_messages (from_number, created_at);
CREATE INDEX IF NOT EXISTS sms_messages_to_created ON crm.sms_messages (to_number, created_at);

CREATE TABLE IF NOT EXISTS crm.calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL DEFAULT 'twilio',
  provider_sid     text NOT NULL UNIQUE,
  direction        crm.call_direction NOT NULL,
  from_number      text NOT NULL,
  to_number        text NOT NULL,
  user_id          uuid REFERENCES auth.users(id),
  employee_id      uuid REFERENCES auth.employees(id),
  status           crm.call_status NOT NULL,
  duration_seconds integer,
  recording_url    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by_id    uuid REFERENCES auth.users(id),
  updated_by_id    uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS calls_user_started ON crm.calls (user_id, started_at);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON crm.calls
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
