-- The purities the lead Add item drawer offers: every label with its fine
-- fraction, by metal and then the label's own order.
SELECT id, metal_id, label, purity, sort_order
  FROM metals.purity_labels
 ORDER BY metal_id, sort_order, label
