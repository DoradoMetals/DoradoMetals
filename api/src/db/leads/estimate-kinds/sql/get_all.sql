-- Every row of leads.estimate_kinds, in the order a select offers them.
SELECT id, key, label, sort_order
  FROM leads.estimate_kinds
 ORDER BY sort_order, key
