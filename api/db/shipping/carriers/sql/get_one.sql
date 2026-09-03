-- One carrier, by id. organization_id is projected but must never reach the wire.
SELECT id, logo, organization_id
  FROM shipping.carriers
 WHERE id = $1
