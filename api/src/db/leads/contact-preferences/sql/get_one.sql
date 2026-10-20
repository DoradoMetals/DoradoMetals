-- One contact preference by id.
SELECT id, key, label, sort_order
  FROM leads.contact_preferences
 WHERE id = $1
