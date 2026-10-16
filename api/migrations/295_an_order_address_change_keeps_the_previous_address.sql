-- AN ORDER ADDRESS CHANGE KEEPS THE PREVIOUS ADDRESS.
--
-- orders.addresses holds one row per order and a change overwrote address_id,
-- so nothing recorded which address the order pointed at before. previous_address_id
-- is that link: the create statement sets it to the old address_id when it replaces
-- a row. The places.addresses row itself is never deleted or changed; a change adds
-- a new snapshot row and the old one stays.
--
-- One nullable column and its foreign key; additive, no row is read or written.
-- `exchange` is untouched.

ALTER TABLE orders.addresses ADD COLUMN IF NOT EXISTS previous_address_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'order_addresses_previous_address_id_fkey' AND c.relname = 'addresses' AND n.nspname = 'orders'
  ) THEN
    ALTER TABLE orders.addresses ADD CONSTRAINT order_addresses_previous_address_id_fkey FOREIGN KEY (previous_address_id) REFERENCES places.addresses(id);
  END IF;
END $$;
