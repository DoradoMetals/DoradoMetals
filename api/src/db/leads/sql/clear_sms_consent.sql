UPDATE leads.leads
   SET sms_consent_at = NULL
 WHERE id = $1
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority,
          assigned_to_id, source, sms_consent_at, sms_consent_method,
          number, source_id, contact_preference_id,
          contacted_at, responded_at, converted_at,
          /*__lead_stage__*/ AS lead_stage
