SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority,
       assigned_to_id, source, sms_consent_at, sms_consent_method,
       /*__lead_stage__*/ AS lead_stage
  FROM leads.leads
 WHERE phone = $1
 ORDER BY created_at DESC, id DESC
 LIMIT 1
