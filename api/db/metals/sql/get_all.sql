-- Every metal. Four rows, seeded reference data.
-- `name` is what metals.metals calls the column exchange.metals calls `type` - the only column either table shares beyond id.
SELECT id, name
  FROM metals.metals
 ORDER BY name ASC
