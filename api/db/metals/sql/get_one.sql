-- One metal, by id.
SELECT id, name
  FROM metals.metals
 WHERE id = $1
