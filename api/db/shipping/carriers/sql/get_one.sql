SELECT id, logo, organization_id
  FROM shipping.carriers
 WHERE id = $1
