-- A new carrier. The organization it IS is created by the organizations
-- service, in the same transaction, and its id arrives here.
INSERT INTO shipping.carriers (id, organization_id, logo)
VALUES ($1, $2, $3)
RETURNING id, logo, organization_id
