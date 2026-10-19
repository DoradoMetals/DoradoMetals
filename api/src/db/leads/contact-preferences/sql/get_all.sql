-- Every row of leads.contact_preferences, in the order a select offers them.
SELECT id, key, label, sort_order
  FROM leads.contact_preferences
 ORDER BY sort_order, key
