-- The address book, which was migrated and never backfilled.
--
-- features/addresses was split into repo.exchange/repo.next/repo.dual with an
-- ADDRESSES_SOURCE switch, tests and a verified read diff - and nothing ever
-- copied the data. On a database built from exchange, places.addresses would
-- hold only per-order snapshots and the three shop addresses, so every
-- customer's saved address list would come back empty.
--
-- Found by the shipping backfill, which references places.addresses for the
-- customer side of a shipment and had nothing to point at. That is what the
-- from-empty check is for: against dev the rows were already there from
-- January, so nothing looked wrong.
--
-- An address splits in two: places.addresses is somewhere on earth, and
-- places.user_addresses is a person's relationship to it. exchange has one
-- is_default; places has a shipping default and a billing default, and both
-- follow it until someone decides they should differ.
--
-- Idempotent, and guarded: an address book row in the new schema that exchange
-- does not have means exchange is no longer authoritative. Snapshots are
-- excluded from that check - they are created by the orders backfill and have
-- no counterpart by design.
--
-- exchange is only ever read.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM places.user_addresses ua
    WHERE NOT EXISTS (SELECT 1 FROM exchange.addresses e WHERE e.id = ua.address_id)
  ) THEN
    RAISE EXCEPTION
      'refusing to backfill: places.user_addresses references an address exchange does not have, so exchange is no longer authoritative.';
  END IF;
END $$;

INSERT INTO places.addresses (
  id, line_1, line_2, city, state, country, zip,
  country_code, phone_number, created_at, updated_at, is_valid, is_residential
)
SELECT
  e.id, e.line_1, e.line_2, e.city, e.state, e.country, e.zip,
  e.country_code, e.phone_number, e.created_at, e.updated_at,
  e.is_valid, coalesce(e.is_residential, false)
FROM exchange.addresses e
ON CONFLICT (id) DO UPDATE SET
  line_1 = EXCLUDED.line_1, line_2 = EXCLUDED.line_2, city = EXCLUDED.city,
  state = EXCLUDED.state, country = EXCLUDED.country, zip = EXCLUDED.zip,
  country_code = EXCLUDED.country_code, phone_number = EXCLUDED.phone_number,
  updated_at = EXCLUDED.updated_at, is_valid = EXCLUDED.is_valid,
  is_residential = EXCLUDED.is_residential;

INSERT INTO places.user_addresses (
  address_id, user_id, label, default_shipping, default_billing
)
SELECT e.id, e.user_id, e.name,
       coalesce(e.is_default, false), coalesce(e.is_default, false)
FROM exchange.addresses e
WHERE e.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id)
ON CONFLICT (user_id, address_id) DO UPDATE SET
  label = EXCLUDED.label,
  default_shipping = EXCLUDED.default_shipping,
  default_billing = EXCLUDED.default_billing;

-- Now that the address book exists, fill in the customer side of any shipment
-- 049 had to leave null.

UPDATE shipping.shipments s
SET shipper_address_id   = CASE WHEN s.direction = 'Inbound'  THEN src.address_id ELSE s.shipper_address_id END,
    recipient_address_id = CASE WHEN s.direction = 'Outbound' THEN src.address_id ELSE s.recipient_address_id END
FROM (
  SELECT e.id AS shipment_id,
         coalesce(
           (SELECT p.address_id FROM exchange.purchase_orders p WHERE p.id = e.purchase_order_id),
           (SELECT so.address_id FROM exchange.sales_orders so WHERE so.id = e.sales_order_id)
         ) AS address_id
  FROM exchange.shipments e
) AS src
WHERE src.shipment_id = s.id
  AND src.address_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM places.addresses pa WHERE pa.id = src.address_id)
  AND (CASE WHEN s.direction = 'Inbound' THEN s.shipper_address_id ELSE s.recipient_address_id END) IS NULL;
