-- A carrier's own column. Everything a caller thinks of as the carrier's
-- identity - name, email, phone, enabled - belongs to the organization and is
-- updated through its own service.
UPDATE shipping.carriers
   SET logo = $1
 WHERE id = $2
RETURNING id, logo, organization_id
