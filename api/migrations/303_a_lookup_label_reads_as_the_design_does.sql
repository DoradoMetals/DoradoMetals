-- A LOOKUP LABEL READS AS THE DESIGN DOES.
--
-- The People file's Add item drawer names the weight units Troy Oz, Grams,
-- DWT and LBs, and calls the .925 silver purity Sterling. The keys, the gram
-- factors and the fine fractions do not change, so nothing that prices or
-- matches on a key moves; only the words a screen shows do.
--
-- Data only, on two lookup tables. Idempotent: each row is matched on its key
-- and its old label. `exchange` is neither read nor written.

UPDATE leads.weight_units u
   SET label = v.label
  FROM (VALUES
    ('troy_oz', 'troy oz', 'Troy Oz'),
    ('g',       'g',       'Grams'),
    ('dwt',     'dwt',     'DWT'),
    ('lb',      'lb',      'LBs')
  ) AS v(key, old_label, label)
 WHERE u.key = v.key
   AND u.label = v.old_label;

UPDATE metals.purity_labels
   SET label = 'Sterling'
 WHERE metal_id = 'Silver'
   AND label = '.925';
