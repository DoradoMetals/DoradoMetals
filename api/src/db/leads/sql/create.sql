INSERT INTO leads.leads
       (name, phone, email, priority, notes, last_contacted)
VALUES ($1, $2, $3, COALESCE($4, 'Medium'), $5, NOW())
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority, assigned_to_id, source
