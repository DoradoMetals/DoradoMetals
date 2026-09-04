-- ONE UNIQUE KEY ON (user_id, address_id), NOT TWO.
--
-- 123 added `user_addresses_user_address_key` - a named UNIQUE CONSTRAINT - so
-- the three composite foreign keys it also added would have something in
-- pg_constraint to document themselves against. That was measured against
-- pg_constraint, which is exactly where the mistake was: dev ALSO carried a
-- bare unique INDEX on the same two columns, `user_addresses_user_address_uniq`,
-- created directly in the January refactor and never written as a migration -
-- it exists only as a line in the generated genesis file.
--
-- *** WHY THE DUPLICATE IS NOT MERELY UNTIDY. *** Postgres bound all three new
-- FKs to the OLDER index (pg_constraint.conindid names it, verified after 123
-- applied). `scripts/dump-schema.mjs` skips any index a constraint points at -
-- correctly, for the index a PRIMARY KEY or UNIQUE brings with it - and
-- conindid on a FOREIGN KEY means the index it REFERENCES. So the moment the
-- FKs bound to it, the old index vanished from the regenerated genesis file
-- while still existing on dev. `verify:genesis` caught it as one difference:
--
--   DIFF places.user_addresses: missing index user_addresses_user_address_uniq
--
-- A fresh build is fine either way, because genesis emits the named constraint
-- before the FKs. What is not fine is dev holding an index the file that
-- defines production does not create - so the duplicate goes, and the FKs move
-- onto the constraint that IS in the file.
--
-- *** NOTHING IS UNPROTECTED AT ANY POINT. *** The whole file runs in one
-- transaction (scripts/migrate.mjs wraps each migration in BEGIN/COMMIT), and
-- `user_addresses_user_address_key` - an identical UNIQUE (user_id, address_id)
-- - is in place before this starts and stays in place throughout. Uniqueness is
-- enforced continuously; only the second copy of the enforcement is dropped.
-- The FKs are dropped and re-added in the same transaction, so there is no
-- window in which a checkout could name an address outside its owner's book.
--
-- This touches places and checkout. exchange is not read or written.
-- -- allow-destructive: DROP INDEX places.user_addresses_user_address_uniq is a
-- SECOND copy of a uniqueness guarantee that the constraint added in 123 holds
-- for the whole of this transaction. No row is read, written or deleted; the
-- backup is the guarantee itself, which never lapses. Verified after applying
-- with pg_indexes and verify:genesis.

ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_recipient_address_theirs_fk;
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_shipper_address_theirs_fk;
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_pickup_address_theirs_fk;

DROP INDEX IF EXISTS places.user_addresses_user_address_uniq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_recipient_address_theirs_fk'
  ) THEN
    ALTER TABLE checkout.checkouts
      ADD CONSTRAINT checkouts_recipient_address_theirs_fk
      FOREIGN KEY (user_id, recipient_address_id)
      REFERENCES places.user_addresses (user_id, address_id)
      ON DELETE SET NULL (recipient_address_id);
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
