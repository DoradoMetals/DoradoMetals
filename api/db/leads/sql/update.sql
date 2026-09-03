-- Every mutable field of a lead.
--
-- updated_at is set here rather than left to the caller. Forty-two of the
-- fifty-two UPDATE statements against exchange do not maintain it, which is why
-- a drifted row cannot be spotted from its timestamp; this one does.
UPDATE leads.leads
   SET name           = $1,
       phone          = $2,
       email          = $3,
       updated_at     = NOW(),
       updated_by     = $4,
       last_contacted = $5,
       converted      = $6,
       contacted      = $7,
       responded      = $8,
       contact        = $9,
       notes          = $10,
       priority       = $11
 WHERE id = $12
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority
