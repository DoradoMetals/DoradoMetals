-- A shipment may not know both of its addresses.
--
-- shipping.shipments carries a check requiring shipper_address_id and
-- recipient_address_id to both be set. exchange.shipments has no address column
-- at all, so nothing can be backfilled without inventing one, and the check
-- rejects every row.
--
-- What the existing 17 rows do is consistent and derivable only in part. One
-- side is the customer's address, reachable through the order. The other is a
-- business location: FedEx Office - Farmers Branch on all 11 inbound shipments,
-- Elemetal on all 6 outbound. That is a clean pattern in dev and a guess about
-- production, which has 70 shipments and no column recording which location
-- handled any of them.
--
-- So the check is relaxed rather than satisfied by assertion. The customer side
-- is backfilled from the order; the business side stays null until there is a
-- rule someone has confirmed rather than one inferred from seventeen rows.
--
-- Reversible: re-adding the constraint is one statement, once the business side
-- is populated. Nothing reads shipping.shipments yet.
--
-- exchange is untouched.

ALTER TABLE shipping.shipments
  DROP CONSTRAINT IF EXISTS shipments_addresses_required;
