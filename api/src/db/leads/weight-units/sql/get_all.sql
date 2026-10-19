-- Every weight unit an estimate item may be weighed in, with its gram factor,
-- in the order the Add item drawer offers them.
SELECT id, key, label, grams, sort_order
  FROM leads.weight_units
 ORDER BY sort_order, key
