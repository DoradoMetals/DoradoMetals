-- A new lead. An explicit id wins; NULL generates one.
--
-- priority defaults through COALESCE rather than a column default, because the
-- caller may legitimately send null meaning "unspecified" and the two schemas
-- must agree on what that becomes.
--
-- NO AUDIT COLUMNS. created_at, updated_at, created_by, created_by_id,
-- updated_by and updated_by_id are written by the public.audit_stamp trigger
-- from the actor on the connection (migration 116). They are still PROJECTED,
-- because the wire has always carried them.
INSERT INTO leads.leads
       (id, name, phone, email, priority, notes, last_contacted)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, COALESCE($5, 'Medium'), $6, NOW())
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority
