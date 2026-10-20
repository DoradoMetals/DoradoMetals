-- The live (not archived) lead holding this exact phone text, if any. The
-- create path takes lock_phone first so two creates cannot both miss it.
SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, city, state, contact, priority,
       assigned_to_id, source, sms_consent_at, sms_consent_method,
       number, source_id, contact_preference_id,
       contacted_at, responded_at, converted_at, archived_at,
       /*__lead_stage__*/ AS lead_stage
  FROM leads.leads
 WHERE phone = $1
   AND archived_at IS NULL
 ORDER BY created_at DESC, id DESC
 LIMIT 1
