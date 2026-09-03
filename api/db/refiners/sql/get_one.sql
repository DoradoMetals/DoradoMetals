-- One refiner, by id. organization_id IS projected but never reaches the wire: compose.ts uses it to attach the organization as a nested object, then drops it.
-- Columns are listed rather than SELECT * so organization_id can't leak onto the wire by accident.
SELECT id, logo, organization_id
  FROM refiners.refiners
 WHERE id = $1
