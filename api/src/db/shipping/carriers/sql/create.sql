INSERT INTO shipping.carriers (organization_id, logo)
VALUES ($1, $2)
RETURNING id, logo, organization_id
