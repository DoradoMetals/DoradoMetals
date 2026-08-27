-- A new organization.
--
-- `type` distinguishes a CARRIER from a REFINER from the business itself. The
-- caller supplies it - this table does not know what it is being created for.
INSERT INTO organizations.organizations (id, type, name, email, phone, enabled)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, type, name, email, phone, enabled, created_at, updated_at
