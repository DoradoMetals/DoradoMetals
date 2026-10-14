-- Making a source the default clears the old one in the same statement, so
-- there is never a moment with two defaults or none. sources_one_default is
-- checked at the end of the statement (migration 267). A source that does not
-- exist clears nothing.
UPDATE spots.sources
   SET is_default = (id = $1)
 WHERE (is_default OR id = $1)
   AND EXISTS (SELECT 1 FROM spots.sources s WHERE s.id = $1)
RETURNING id
