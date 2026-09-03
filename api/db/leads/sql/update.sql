-- The one update (D212's CRUD ruling): every patchable column is
-- COALESCE($n, col), so a column absent from the patch keeps its value. The
-- caller distinguishes "leave alone" from "set false" by omitting the field
-- entirely - the repo passes `patch.field ?? null` per column, and `??` only
-- substitutes on null/undefined, never on `false`.
UPDATE leads.leads
   SET name           = COALESCE($1, name),
       phone          = COALESCE($2, phone),
       email          = COALESCE($3, email),
       last_contacted = COALESCE($4, last_contacted),
       converted      = COALESCE($5, converted),
       contacted      = COALESCE($6, contacted),
       responded      = COALESCE($7, responded),
       contact        = COALESCE($8, contact),
       notes          = COALESCE($9, notes),
       priority       = COALESCE($10, priority),
       updated_by     = COALESCE($11, updated_by),
       updated_at     = NOW()
 WHERE id = $12
