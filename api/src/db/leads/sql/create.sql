-- `notes` is the lead's Notes & preferences text (the Details card and the
-- New lead drawer); the timeline's notes are rows in crm.notes (migration 252).
INSERT INTO leads.leads
       (name, phone, email, priority, last_contacted, source, assigned_to_id,
        source_id, contact_preference_id, notes, city, state)
VALUES ($1, $2, $3, COALESCE($4, 'Medium'), NOW(), $5, $6, $7, $8, $9, $10, $11)
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, city, state, contact, priority,
          assigned_to_id, source, sms_consent_at, sms_consent_method,
          number, source_id, contact_preference_id,
          contacted_at, responded_at, converted_at, archived_at,
          /*__lead_stage__*/ AS lead_stage
