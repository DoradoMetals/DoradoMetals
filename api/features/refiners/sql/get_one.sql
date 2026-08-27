-- One refiner, by id.
--
-- organization_id IS projected, unlike on the wire. compose.ts needs it to
-- attach the organization, and the composed shape drops it again - a refiner's
-- organization is exposed as a nested object, never as a foreign key.
--
-- Columns are listed rather than selected with *: refiners.refiners carries
-- organization_id, which exchange.suppliers has no equivalent for, and
-- it must not reach the wire while both schemas are serving
SELECT id, logo, organization_id
  FROM refiners.refiners
 WHERE id = $1
