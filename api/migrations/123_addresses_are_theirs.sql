-- AN ADDRESS ON A CHECKOUT IS THE CUSTOMER'S OWN, AND THE DATABASE SAYS SO
-- (ruling 64: "Why do we have to reference arrays of columns so much? That
-- shouldn't be a thing.")
--
-- domain/checkout/service.ts carried ADDRESS_COLUMNS - a hand-written list of
-- three column names - and looped over it asking places.user_addresses whether
-- each id the patch named was in the caller's book. That is a foreign key
-- written in TypeScript: three round trips per patch, a list that goes stale
-- the moment a fourth address column appears, and a guarantee that holds only
-- for callers that remember to run the loop.
--
-- It is a composite foreign key. checkout.checkouts already carries user_id,
-- so (user_id, <address column>) referencing places.user_addresses
-- (user_id, address_id) says "this address is in THIS row's owner's book" as a
-- constraint, checked by Postgres on every write, from every caller, forever.
-- A patch naming somebody else's address id raises 23503; shared/db/pg-error.ts
-- turns that into the domain's Invalid naming the column, so the wire answer is
-- the same 422 the loop gave.
--
-- *** WHAT WAS MEASURED FIRST, read-only against dev on 2026-09-04. ***
--   - places.user_addresses has NO unique constraint on (user_id, address_id)
--     today, so the FK has nothing to reference. It has no duplicate pairs
--     either (0 rows from a GROUP BY ... HAVING count(*) > 1), so the UNIQUE
--     below is a tightening that fits the data as it stands.
--   - Every checkout address id already resolves in the owner's book:
--     0 recipient, 0 shipper and 0 pickup orphans. So all three FKs are added
--     VALID rather than NOT VALID - nothing needs a later validation pass.
--
-- *** ON DELETE SET NULL, AND ONLY THE ADDRESS COLUMN. *** Read from how a
-- book entry is actually deleted today (domain/places/addresses/service.ts
-- `remove`): the LINK goes first, and the address row itself only goes if
-- nothing else references it. So the event a checkout has to survive is the
-- user_addresses row disappearing - and the right answer is the one the three
-- single-column FKs already gave: clear the column. Refusing the delete would
-- mean a customer cannot tidy their address book while a half-finished
-- checkout points at an entry, and checkout.* is device-sync, not a ledger
-- (CLAUDE.md) - clearing one column of it costs a re-pick.
--
-- Postgres 15+ takes a column list on SET NULL, and dev/local are both 16, so
-- `ON DELETE SET NULL (recipient_address_id)` nulls ONLY that column. Without
-- the list it would try to null user_id too, which is NOT NULL - the delete
-- would fail with a confusing error instead of doing the obvious thing.
--
-- *** THE THREE SINGLE-COLUMN FKs ARE REPLACED, NOT KEPT BESIDE. *** Each
-- pointed at places.addresses(id); user_addresses.address_id already
-- references that same row, so the composite implies it. Keeping both would
-- mean two constraints firing on one write and two different errors for one
-- mistake.
--
-- *** orders.addresses IS DELIBERATELY NOT GIVEN THE SAME TREATMENT. *** It
-- looks like the same "must be theirs" reference and is the opposite: it is
-- the SNAPSHOT of where a parcel actually went, written by the server from a
-- checkout whose ownership was already proved, and its own SQL comment says a
-- delivered order must not lose where it went. A composite FK onto
-- user_addresses would make deleting a book entry SET NULL the snapshot's
-- source - deleting business history to enforce a rule about a live choice.
-- No such FK is added, and none should be.
--
-- exchange is not read or written here. Every ADD CONSTRAINT is wrapped in a
-- DO block that checks pg_constraint first (Postgres has no ADD CONSTRAINT IF
-- NOT EXISTS), so a partial apply resumes cleanly.

-- ================================== 1. the book gets the key the FK references

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_user_address_key'
  ) THEN
    ALTER TABLE places.user_addresses
      ADD CONSTRAINT user_addresses_user_address_key UNIQUE (user_id, address_id);
  END IF;
END $$;

-- ============================ 2. the checkout's addresses must be in that book

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_recipient_address_fk'
  ) THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_recipient_address_fk;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_recipient_address_theirs_fk'
  ) THEN
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_recipient_address_theirs_fk
      FOREIGN KEY (user_id, recipient_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (recipient_address_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_shipper_address_fk'
  ) THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_shipper_address_fk;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_shipper_address_theirs_fk'
  ) THEN
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_shipper_address_theirs_fk
      FOREIGN KEY (user_id, shipper_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (shipper_address_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_pickup_address_fk'
  ) THEN
    ALTER TABLE checkout.checkouts DROP CONSTRAINT checkouts_pickup_address_fk;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_pickup_address_theirs_fk'
  ) THEN
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_pickup_address_theirs_fk
      FOREIGN KEY (user_id, pickup_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (pickup_address_id);
  END IF;
END $$;

-- The referencing side of each new FK wants its own index, the same way 001
-- and 007 indexed every other one: a delete from places.user_addresses has to
-- find the checkout rows to null.
CREATE INDEX IF NOT EXISTS checkouts_user_recipient_address_idx
  ON checkout.checkouts (user_id, recipient_address_id);
CREATE INDEX IF NOT EXISTS checkouts_user_shipper_address_idx
  ON checkout.checkouts (user_id, shipper_address_id);
CREATE INDEX IF NOT EXISTS checkouts_user_pickup_address_idx
  ON checkout.checkouts (user_id, pickup_address_id);
