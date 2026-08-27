-- The same lead, written to the schema still serving as the record of truth.
--
-- THE ID IS SUPPLIED, not generated here. Both schemas must end up with the
-- same primary key, and the only way to guarantee that is for one side to
-- choose it and both to use it. The service generates it.
INSERT INTO exchange.leads
       (id, name, phone, email, created_by, updated_by, priority, notes, last_contacted)
VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Medium'), $8, NOW())
RETURNING id
