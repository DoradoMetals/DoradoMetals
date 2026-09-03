-- The audit columns stop being written by code.
--
-- Jacob: "Probably needs to handle created by on creates too... I still think
-- it should happen now so we can remove as much prop spreads as possible."
--
-- WHAT IT REPLACES. created_by / updated_by / created_at / updated_at were
-- carried by hand: an `actor` parameter on every repo create and update, a
-- `user_name` field on request bodies the client could set, `updated_by`
-- spread into a patch object, and `updated_at = NOW()` appended to a dozen
-- statements. Every one of those is a place to forget, and a forgotten stamp
-- is invisible - a row written by nobody looks exactly like a row written by
-- somebody the code failed to record. The database knows who is connected and
-- what time it is, so the database writes them.
--
-- HOW THE ACTOR ARRIVES. shared/http/actor.ts holds the session's user id in
-- an AsyncLocalStorage for the length of a request; shared/db/withTransaction.ts
-- issues `set_config('app.actor_id', <id>, true)` right after BEGIN. The third
-- argument is TRANSACTION-LOCAL, which is the safety property that matters:
-- connections come from a pool, and a session-level setting would outlive the
-- request that set it and stamp the next customer's rows with the previous
-- customer's id. An unauthenticated request, a cron sweep and a Stripe webhook
-- set '' and their rows read as system-authored, which is the truth about them.
--
-- WHY ONE FUNCTION AND NOT ONE PER COLUMN-SHAPE. The 26 tables below carry six
-- different combinations of these columns, and `NEW.created_by` in plpgsql
-- raises on a table that has no such column - so a single function has to ask
-- rather than assume. It asks pg_attribute for the columns this table actually
-- has (TG_RELID, one syscache lookup), builds a jsonb patch of only the columns
-- it means to change, and applies it with jsonb_populate_record(NEW, patch).
-- Untouched columns are copied from NEW itself and never round-trip through
-- jsonb, so no value can be reshaped by the conversion; the only columns that
-- convert are the timestamptz, uuid and text ones this function writes.
--
-- clock_timestamp() RATHER THAN now(). now() is the transaction's start time
-- and is constant within it, so a row created and then edited inside one
-- transaction would come out with updated_at exactly equal to created_at - the
-- audit trail would say the edit never happened. clock_timestamp() advances.
--
-- AN INSERT KEEPS TIMESTAMPS IT WAS GIVEN (created_at and updated_at are
-- COALESCEd, not assigned). The backfills copy historical created_at/updated_at
-- out of exchange, and a production build runs them; assigning here would
-- rewrite every one of those rows to the moment the backfill ran and there is
-- no second copy of the real dates. This migration is numbered after every
-- backfill so they never see the trigger at all, and the COALESCE is the belt
-- to that braces.
--
-- AN UNKNOWN ACTOR STAMPS NOTHING. Every *_by_id column below is a foreign key
-- to auth.users, so an id that is not a user would raise 23503 and REFUSE THE
-- WRITE - an audit field failing an order. The function resolves the actor
-- against auth.users first and leaves the columns alone when there is no such
-- row, so the worst case is an unattributed row rather than a lost one.
--
-- THE LEGACY TEXT NAME COLUMNS ARE FILLED TOO, from auth.users.name, so the
-- admin screens keep showing names until the constraint sweep drops them.
-- Thirteen tables carry a text created_by/updated_by beside the _id pair:
-- fulfillments.fulfillments, fulfillments.methods, leads.leads, orders.orders,
-- orders.transactions, organizations.organizations, payments.details,
-- payments.intents, payments.methods, products.bullion, rates.rates,
-- reviews.reviews and shipping.services. checkout.items has the text pair with
-- NO _id sibling. shipping.packages is the odd one out: its created_by and
-- updated_by are UUID, so they are treated as id columns, by type rather than
-- by name.
--
-- The name column takes the actor's name in PREFERENCE to what NEW carries,
-- which is the one place this does not COALESCE the caller's value first. It
-- has to: products.bullion.created_by defaults to '' and rates.rates.created_by
-- defaults to 'Dorado Admin', and a COALESCE against NULL never fires on a
-- column that has a default - the real author would lose to a placeholder.
--
-- exchange is untouched: no trigger is installed on it, and no exchange table
-- is read or written here.

-- ---------------------------------------------------------------- the function
--
-- public, not exchange and not auth: it belongs to no domain and is installed
-- on tables in ten different schemas. SECURITY INVOKER (the default) on
-- purpose - the application owns these tables, and a SECURITY DEFINER function
-- reading auth.users would need a pinned search_path to be safe for no gain.
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
  raw := nullif(current_setting('app.actor_id', true), '');
  IF raw ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
    SELECT u.id, u.name INTO actor, actor_name
      FROM auth.users u WHERE u.id = raw::uuid;
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

-- ---------------------------------------------------------------- the triggers
--
-- Every BASE TABLE outside exchange and auth carrying at least one of the six
-- columns, listed rather than discovered at apply time: a DO block over
-- information_schema would install a different set on every database, and this
-- file has to mean the same thing on dev and on the production that has never
-- run it. The set was read from dev's information_schema on 2026-09-02.
--
-- auth.* is excluded because better-auth owns those tables through its own
-- pool and its own column names ("createdAt", "updatedAt"); exchange.* because
-- it is frozen.
--
-- CREATE OR REPLACE TRIGGER, so the file is a no-op on a database that has
-- already run it.

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON checkout.items
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON fulfillments.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON fulfillments.methods
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON media.images
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON media.pdfs
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.spots
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON organizations.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.details
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.intents
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.methods
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON payments.stripe_charges
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON places.addresses
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON products.bullion
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON products.mints
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON rates.rates
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON refiners.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON refiners.spots
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON reviews.reviews
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON shipping.packages
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON shipping.services
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON shipping.shipments
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON spots.spots
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
