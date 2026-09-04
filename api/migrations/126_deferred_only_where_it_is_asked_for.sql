-- THE ADDRESS-OWNERSHIP KEYS ARE DEFERRABLE, AND IMMEDIATE UNLESS ASKED.
--
-- 125 made 123's three composite foreign keys DEFERRABLE INITIALLY DEFERRED so
-- that ruling 63's basket adoption - which re-keys the address book and then
-- the checkout rows that point at it - could move both facts inside one
-- transaction. It works, and it cost something that is worth more than the
-- convenience: THE RULE STOPPED BEING TESTABLE.
--
-- `shared/testing/pinned-pool.ts` runs each request inside one outer
-- transaction that is rolled back, rewriting BEGIN to SAVEPOINT and COMMIT to
-- RELEASE SAVEPOINT. A deferred constraint fires at COMMIT, and there is no
-- COMMIT in that harness - so `checkout-row.test.ts`'s "an address lands only
-- if it is in the CALLER'S book" went from 422 to 200. Live, the check still
-- ran at withTransaction's real COMMIT and the theft was still refused; in the
-- suite, the security rule silently stopped being proved. A guarantee nothing
-- can test is one nobody will notice losing.
--
-- So: DEFERRABLE INITIALLY IMMEDIATE. Every ordinary write is checked at the
-- statement, exactly as 123 intended and as the test asserts. The ONE flow that
-- genuinely needs both facts to move together asks for the deferral itself, in
-- code, at its own call site - `db/checkout/checkouts/repo.ts`
-- `deferAddressOwnership`, called by `domain/checkout/adopt.ts` - so the
-- weakening is one line long, is named for its reason, and lasts one
-- transaction.
--
-- exchange is not read or written.

ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_recipient_address_theirs_fk;
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_shipper_address_theirs_fk;
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_pickup_address_theirs_fk;

ALTER TABLE checkout.checkouts
  ADD CONSTRAINT checkouts_recipient_address_theirs_fk
  FOREIGN KEY (user_id, recipient_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (recipient_address_id)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE checkout.checkouts
  ADD CONSTRAINT checkouts_shipper_address_theirs_fk
  FOREIGN KEY (user_id, shipper_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (shipper_address_id)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE checkout.checkouts
  ADD CONSTRAINT checkouts_pickup_address_theirs_fk
  FOREIGN KEY (user_id, pickup_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (pickup_address_id)
  DEFERRABLE INITIALLY IMMEDIATE;
