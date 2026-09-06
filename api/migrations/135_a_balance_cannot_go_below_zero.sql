-- A CREDIT BALANCE CANNOT GO BELOW ZERO (review finding 5: MP F7, MI F3).
--
-- `auth.users.dorado_funds` carried a UNIQUE(email) and a PRIMARY KEY and
-- nothing else. The sale placement path priced the customer's balance OUTSIDE
-- its transaction and then debited blind - `SET dorado_funds =
-- COALESCE(dorado_funds, 0) - $1`, no WHERE, no floor - so two in-flight
-- placements each priced $100 and each subtracted $100, leaving -100. The
-- reviewer reproduced exactly that against the local test database.
--
-- The code half of the fix is in `transactions/credit/service.ts`:
-- `removeFunds` now reads the row `FOR UPDATE` inside the caller's transaction
-- and refuses through `refuseNegativeBalance` before it adjusts, so the second
-- placement blocks on the lock and then refuses rather than racing. This
-- constraint is the backstop underneath it: any path that ever reaches the
-- column without that read - a script, a psql session, a future repo - gets a
-- rollback instead of a negative balance.
--
-- NOT VALID on purpose. The constraint is enforced on every INSERT and UPDATE
-- from the moment it exists; NOT VALID only skips the scan of rows already
-- there. That matters because this project's one rule is that data is not
-- lost: a pre-existing negative balance (dev, or production on the day the
-- chain runs there) would make a validating ALTER fail and take the whole
-- migration with it, and the right answer to such a row is a person looking at
-- it, not a migration refusing to apply. NULL is untouched - `NULL >= 0` is
-- unknown, which a CHECK accepts, and the column is nullable by design.
--
-- NUMBERED 135, AND IDEMPOTENT, BECAUSE IT WAS 134 FIRST. Two lanes reached
-- 134 on the same evening; the other one is
-- `134_one_definition_of_fine_content.sql` and it keeps the number. Dev
-- already carries this constraint - it was applied there under the old
-- filename - so the guard below is what lets 135 run against dev, against a
-- database built from `000_genesis_schema.sql` (which now carries the
-- constraint too), and against a database that has neither, with the same
-- result each time. `pg_constraint` is asked by NAME on `auth.users`: read
-- read-only on 2026-09-05, that table holds exactly ONE check constraint -
-- this one, NOT VALID - and the fine-content migration adds no CHECK to
-- `auth.users` at all, so there is no second spelling to reconcile with.
--
-- No exchange table is read, written, altered or dropped by this file.
--
-- Reversible:
--   ALTER TABLE auth.users DROP CONSTRAINT users_dorado_funds_non_negative;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'users_dorado_funds_non_negative'
      AND c.relname = 'users'
      AND n.nspname = 'auth'
  ) THEN
    ALTER TABLE auth.users
      ADD CONSTRAINT users_dorado_funds_non_negative CHECK (dorado_funds >= 0) NOT VALID;
  END IF;
END $$;
