-- The distinct product types, for the admin dropdown. No filter, deliberately — two production rows carry corrupt values (E'\n\tBar'); see audit:enum-domains, D39. Filtering here would hide the data problem, not fix it.
SELECT DISTINCT type AS name
  FROM products.bullion
