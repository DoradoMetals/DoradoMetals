-- Every sales-tax rule. Eighty-eight rows.
--
-- READ WHOLE, AND MATCHED IN TYPESCRIPT. The implementation this replaces did
-- the matching in SQL: seven BETWEEN ranges, two IN lists and an ORDER BY of
-- seven specificity expressions to pick the most specific rule, per line item.
--
-- That ORDER BY *is* the domain rule - "a rule naming a metal beats one saying
-- All" - encoded where nothing can unit-test it and where a reader has to run
-- the query to find out what it means. Eighty-eight rows load in one read, so
-- the matching moves to service.ts where it can be tested without a database.
--
-- Ordered by id purely so the input to the matcher is stable; the matcher does
-- its own ordering and does not depend on this one.
SELECT id, state_code, metal_category, product_type,
       min_price, max_price, purity_min, purity_max,
       aggregate_min, aggregate_max, weight_min, weight_max,
       is_domestic, is_legal_tender, tax_rate
  FROM tax.sales_tax_rules
 ORDER BY id
