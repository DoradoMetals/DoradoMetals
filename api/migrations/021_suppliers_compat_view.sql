-- A view reassembling exchange.suppliers' shape from the tables that replaced
-- it.
--
-- A supplier is now two rows: an organization of type REFINER holding the
-- contact details, and a refiners row holding the logo and carrying the
-- original supplier id. Neither table alone has the old shape, so verify:parity
-- has nothing to compare against and would report the whole thing as lost.
--
-- Same approach as metals.exchange_compat: give the check something real rather
-- than teach it to look away.
--
-- is_active is organizations.enabled. The id is the refiners id, deliberately -
-- that is what exchange.products.supplier_id references, so it has to be the
-- one that survives.

CREATE VIEW refiners.exchange_compat AS
SELECT
  r.id,
  o.name,
  o.email,
  o.phone,
  o.created_at,
  o.updated_at,
  r.logo,
  o.enabled AS is_active
FROM refiners.refiners r
JOIN organizations.organizations o ON o.id = r.organization_id;
