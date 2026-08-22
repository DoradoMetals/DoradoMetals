-- Keep the address-book id an order was placed against.
--
-- orders.addresses points at a snapshot in places.addresses, which is the right
-- design: editing a saved address should not rewrite the address on a package
-- already moving. But the snapshot has a fresh id, and the order's address id
-- is not an internal detail - it leaves the building.
--
-- The order read returns the address object, the frontend takes `address.id`
-- from it and posts it back as `address_id` when creating a sales order and at
-- checkout, and the API resolves that with addressService.getAddressFromId,
-- which reads exchange.addresses. A snapshot id does not exist there. Switching
-- the read to the new schema without this would take checkout down - the same
-- shape of failure as the executor bug in August, and for the same reason: a
-- value that used to resolve somewhere stopped resolving there.
--
-- So the link back is recorded. The snapshot keeps the values, source_address_id
-- keeps the identity, and the read can return the id that still works while the
-- addresses feature is unmigrated. When places.addresses becomes authoritative
-- and getAddressFromId reads it, the snapshot id can take over. See FOLLOWUPS.
--
-- Additive and nullable; 038 fills it. exchange is untouched.

ALTER TABLE orders.addresses
  ADD COLUMN IF NOT EXISTS source_address_id uuid;

CREATE INDEX IF NOT EXISTS idx_orders_addresses_source_address_id
  ON orders.addresses (source_address_id);
