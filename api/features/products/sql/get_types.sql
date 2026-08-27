-- The distinct product types, for the admin dropdown.
--
-- NO FILTER, which is deliberate and is also a known hazard: two production
-- products carry E'\n\tBar' - a newline and a tab in front of "Bar" - and this
-- offers the corrupt value beside the real one. See audit:enum-domains and D39.
-- Filtering it out here would hide the data problem rather than fix it.
SELECT DISTINCT type AS name
  FROM products.bullion
