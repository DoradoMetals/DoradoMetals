-- Converting a lead re-points its notes at the new customer rather than
-- copying them, which is how the Convert dialog's promise ("the notes follow
-- the lead onto the new customer") is kept. The one-subject CHECK
-- (notes_one_subject) is why both columns move in the same statement: a row
-- cannot sit between subjects even for one intermediate statement.
UPDATE crm.notes
   SET lead_id = NULL, user_id = $2
 WHERE lead_id = $1
