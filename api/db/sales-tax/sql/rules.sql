-- Every sales-tax rule. Eighty-eight rows, read whole and matched in TypeScript (see match.ts) rather than in SQL — the old ORDER BY of seven specificity expressions WAS the domain rule ('a rule naming a metal beats one saying All'), encoded where nothing could unit-test it.
-- Ordered by id purely for a stable input to the matcher; the matcher does its own ordering.
SELECT id, state_code, metal_category, product_type,
       min_price, max_price, purity_min, purity_max,
       aggregate_min, aggregate_max, weight_min, weight_max,
       is_domestic, is_legal_tender, tax_rate
  FROM tax.sales_tax_rules
 ORDER BY id
