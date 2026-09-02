-- WHAT WE WILL INSURE A PARCEL FOR, per active service of one carrier.
--
-- Deliberately NOT part of the get_all projection. That projection is the admin
-- carrier-services wire, validated against exchange.carrier_services' shape
-- (packages/contracts wire/shipping.ts: `CarrierService = CarrierServicesRow`),
-- and max_insured_value has no exchange counterpart - adding it there would be
-- a wire change during a schema migration for no consumer's benefit.
--
-- Keyed by `name` rather than `code` because `code` is NULL on all eight rows
-- in dev and in production (D125), which is the same reason the offered
-- catalogue is served from the carrier's adapter. When those columns are
-- populated, this joins on `code` and nothing above it changes.
SELECT id, name, max_insured_value
  FROM shipping.services
 WHERE carrier_id = $1
   AND is_active = true
