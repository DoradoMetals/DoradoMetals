SELECT m.id, m.sort_order
  FROM metals.metals m
 WHERE m.id = $1
