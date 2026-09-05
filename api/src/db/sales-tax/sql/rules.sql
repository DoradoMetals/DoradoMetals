SELECT id, state_code, metal_category, product_type,
       min_price, max_price, purity_min, purity_max,
       aggregate_min, aggregate_max, weight_min, weight_max,
       is_domestic, is_legal_tender, tax_rate
  FROM tax.sales_tax_rules
 ORDER BY id
