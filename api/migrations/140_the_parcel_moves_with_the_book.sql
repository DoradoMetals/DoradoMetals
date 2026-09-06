-- 137'S KEYS ARE DEFERRABLE, AND IMMEDIATE UNLESS ASKED - the same lesson 123
-- learned as 125 and then corrected as 126, arriving at the same answer.
--
-- 137 gave shipping.shipments and fulfillments.pickups a denormalised user_id
-- and the composite key (user_id, <address column>) -> places.user_addresses.
-- The suite found the one flow it breaks, exactly as it found 123's: ruling
-- 63's basket adoption (domains/checkout/adopt.ts). A visitor signs up, and
-- `places.user_addresses.user_id` is re-keyed from the visitor to the new
-- account. For the length of that one statement the book entry has moved and
-- the parcel that names it has not, so an immediate key refuses it -
-- "update or delete on table user_addresses violates foreign key constraint
-- shipments_shipper_address_theirs_fk".
--
-- THERE IS NO ORDER THAT WORKS, for the reason 125 wrote down: move the parcel
-- first and it names a book row the visitor still owns; move the book first and
-- the parcel is left pointing at a row that changed hands. The two facts are
-- only consistent together.
--
-- INITIALLY IMMEDIATE, not INITIALLY DEFERRED, for the reason 126 wrote down:
-- the test harness never issues a real COMMIT, so a constraint that only fires
-- at COMMIT silently stops being proved. Every ordinary write is checked at the
-- statement. The one flow that needs both facts to move together asks for the
-- deferral itself, at its own call site, and it lasts one transaction -
-- `deferAddressOwnership` on each repo, called by adopt.
--
-- ON UPDATE CASCADE was refused here for 126's reason too: it would move a
-- parcel to another owner as a side effect of an address-book edit, from a
-- constraint, with no code saying so. Adoption re-keys the parcel deliberately,
-- one statement later, and that is where the decision belongs.
--
-- Dropped and re-added rather than ALTERed, which is also what makes this
-- idempotent. exchange is not read or written.

ALTER TABLE shipping.shipments DROP CONSTRAINT IF EXISTS shipments_shipper_address_theirs_fk;
ALTER TABLE shipping.shipments DROP CONSTRAINT IF EXISTS shipments_recipient_address_theirs_fk;
ALTER TABLE fulfillments.pickups DROP CONSTRAINT IF EXISTS pickups_pickup_address_theirs_fk;

ALTER TABLE shipping.shipments
  ADD CONSTRAINT shipments_shipper_address_theirs_fk
  FOREIGN KEY (user_id, shipper_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (shipper_address_id)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE shipping.shipments
  ADD CONSTRAINT shipments_recipient_address_theirs_fk
  FOREIGN KEY (user_id, recipient_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (recipient_address_id)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE fulfillments.pickups
  ADD CONSTRAINT pickups_pickup_address_theirs_fk
  FOREIGN KEY (user_id, pickup_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (pickup_address_id)
  DEFERRABLE INITIALLY IMMEDIATE;
