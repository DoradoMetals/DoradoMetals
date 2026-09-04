INSERT INTO shipping.carriers (id, organization_id, logo)
VALUES ($1, $2, $3)
RETURNING id, logo, organization_id
