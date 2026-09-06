-- Ruling 63's basket adoption: a visitor's parcels become the account's parcels,
-- in the same transaction as the address book that 137's key checks them
-- against.
UPDATE shipping.shipments SET user_id = $2 WHERE user_id = $1
