-- One carrier, by id.
--
-- organization_id IS projected for the same reason as get_all.
--
-- Columns are listed rather than selected with *: shipping.carriers carries
-- organization_id, which exchange.carriers has no equivalent for, and
-- it must not reach the wire while both schemas are serving
SELECT id, logo, organization_id
  FROM shipping.carriers
 WHERE id = $1
