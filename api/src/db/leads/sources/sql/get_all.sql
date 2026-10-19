-- Every row of leads.sources, in the order a select offers them.
SELECT id, key, label, sort_order
  FROM leads.sources
 ORDER BY sort_order, key
