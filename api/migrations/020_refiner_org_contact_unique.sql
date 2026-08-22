-- Carry exchange.suppliers' uniqueness onto the organizations that replace it.
--
-- exchange.suppliers enforces UNIQUE (email) and UNIQUE (phone). In the new
-- layout a supplier is an organization of type REFINER plus a refiners row, and
-- organizations has neither constraint.
--
-- The constraints are scoped to REFINER rather than applied to the whole table.
-- organizations is a superset - mints, carriers, refiners and the business
-- itself all live in it - and there is no reason two mints run by the same
-- company cannot share a contact address. Applying it broadly would also fail
-- outright today: two CARRIER rows share an empty-string email.
--
-- That empty string is its own small problem - '' where NULL is meant, which
-- defeats the uniqueness Postgres would otherwise give for free - but those
-- rows belong to the shipping migration, so it is recorded in FOLLOWUPS.md
-- rather than fixed in passing here.
--
-- Partial unique indexes rather than constraints, because a constraint cannot
-- carry a WHERE clause.

CREATE UNIQUE INDEX IF NOT EXISTS organizations_refiner_email_unique
  ON organizations.organizations (email)
  WHERE type = 'REFINER' AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_refiner_phone_unique
  ON organizations.organizations (phone)
  WHERE type = 'REFINER' AND phone IS NOT NULL;
