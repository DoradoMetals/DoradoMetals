INSERT INTO leads.leads
       (id, name, phone, email, priority, notes, last_contacted)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, COALESCE($5, 'Medium'), $6, NOW())
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority
