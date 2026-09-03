-- Every metal. Four rows, seeded reference data.
--
-- `name` is what metals.metals calls the column exchange.metals calls `type`.
-- A rename, and the only column either table shares beyond the id - exchange
-- carries the spot prices and rate percentages on the same row, which the new
-- schema splits into spots.spots and rates.rates.
SELECT id, name
  FROM metals.metals
 ORDER BY name ASC
