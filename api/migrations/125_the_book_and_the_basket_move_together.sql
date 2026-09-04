-- SIGNING IN MOVES THE ADDRESS BOOK AND THE CHECKOUT IN ONE TRANSACTION, so
-- the constraint between them is checked at COMMIT.
--
-- 123's composite foreign keys - checkout.checkouts (user_id, <address column>)
-- -> places.user_addresses (user_id, address_id) - broke exactly one flow, and
-- the test suite found it: ruling 63's basket adoption
-- (domain/checkout/adopt.ts).
--
-- Adoption re-keys the visitor's address BOOK first
-- (places.user_addresses.user_id: visitor -> customer) and only then the
-- checkout rows that point at it. With an immediate FK the first statement is
-- refused - "update or delete on table user_addresses violates foreign key
-- constraint checkouts_shipper_address_theirs_fk" - because for the length of
-- one statement the book entry has moved and the checkout has not.
--
-- *** WHY DEFERRAL AND NOT A REORDERING. *** There is no order that works. Move
-- the checkout first and its (user_id, address_id) pair names a book row the
-- visitor still owns; move the book first and the checkout is left pointing at
-- a row that changed hands. The two facts are only consistent TOGETHER, which
-- is the situation DEFERRABLE INITIALLY DEFERRED exists for - the same reason
-- 117 gave order_addresses_source_address_id_fkey its deferral.
--
-- *** WHY IT WEAKENS NOTHING. *** The check still runs, on every transaction,
-- against every row; it runs at COMMIT instead of per statement. No transaction
-- can commit with a checkout naming an address outside its owner's book. What
-- changes is only WHEN a bad patch is refused: at COMMIT rather than at the
-- UPDATE. shared/db/withTransaction.ts issues COMMIT inside its own try, so the
-- 23503 is caught and translated by shared/db/pg-error.ts exactly as before,
-- and the caller still gets an Invalid naming the column.
--
-- *** ON UPDATE CASCADE WAS CONSIDERED AND REFUSED. *** It would have fixed the
-- symptom by making a book re-key silently rewrite checkout.checkouts.user_id -
-- moving a checkout row to another owner as a side effect of an address book
-- edit, from three separate constraints, with no code saying so. Adoption
-- re-keys the checkout deliberately, two statements later, and that is where
-- the decision belongs.
--
-- exchange is not read or written.

-- Dropped and re-added rather than ALTERed: Postgres has no ALTER CONSTRAINT
-- that can change ON DELETE, and re-adding is what makes this idempotent - a
-- second run re-creates the same three, deferrable, in one transaction.
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_recipient_address_theirs_fk;
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_shipper_address_theirs_fk;
ALTER TABLE checkout.checkouts DROP CONSTRAINT IF EXISTS checkouts_pickup_address_theirs_fk;

ALTER TABLE checkout.checkouts
  ADD CONSTRAINT checkouts_recipient_address_theirs_fk
  FOREIGN KEY (user_id, recipient_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (recipient_address_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE checkout.checkouts
  ADD CONSTRAINT checkouts_shipper_address_theirs_fk
  FOREIGN KEY (user_id, shipper_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (shipper_address_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE checkout.checkouts
  ADD CONSTRAINT checkouts_pickup_address_theirs_fk
  FOREIGN KEY (user_id, pickup_address_id)
  REFERENCES places.user_addresses (user_id, address_id)
  ON DELETE SET NULL (pickup_address_id)
  DEFERRABLE INITIALLY DEFERRED;
