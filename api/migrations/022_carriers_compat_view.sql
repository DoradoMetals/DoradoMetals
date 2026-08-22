-- A view reassembling exchange.carriers' shape from the tables that replaced it.
--
-- Same approach as metals and refiners: a carrier is now an organization of
-- type CARRIER holding name, contact details and enabled, plus a
-- shipping.carriers row holding the logo and the original carrier id. No single
-- table has the old shape, so verify:parity has nothing to compare against.
--
-- is_active is organizations.enabled. The id is the shipping.carriers id
-- deliberately - FEDEX_CARRIER_ID in providers/fedex/constants.js is that
-- literal uuid, and exchange.shipments.carrier_id references it.

CREATE VIEW shipping.carriers_exchange_compat AS
SELECT
  c.id,
  o.name,
  o.email,
  o.phone,
  c.logo,
  o.enabled AS is_active,
  o.created_at,
  o.updated_at
FROM shipping.carriers c
JOIN organizations.organizations o ON o.id = c.organization_id;
