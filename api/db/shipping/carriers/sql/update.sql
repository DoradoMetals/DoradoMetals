-- Only logo; identity fields belong to the organization.
UPDATE shipping.carriers
   SET logo = $1
 WHERE id = $2
RETURNING id, logo, organization_id
