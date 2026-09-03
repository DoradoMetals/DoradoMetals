-- A new lead. An explicit id wins; NULL generates one.
--
-- priority defaults through COALESCE rather than a column default, because the
-- caller may legitimately send null meaning "unspecified" and the two schemas
-- must agree on what that becomes.
INSERT INTO leads.leads
       (id, name, phone, email, created_by, updated_by, priority, notes, last_contacted)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, COALESCE($7, 'Medium'), $8, NOW())
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority
