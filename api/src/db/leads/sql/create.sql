INSERT INTO leads.leads
       (name, phone, email, priority, notes, last_contacted, source, assigned_to_id)
VALUES ($1, $2, $3, COALESCE($4, 'Medium'), $5, NOW(), $6, $7)
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority,
          assigned_to_id, source,
          /*__lead_stage__*/ AS lead_stage
