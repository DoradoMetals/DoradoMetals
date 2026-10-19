-- Ruling 162: restoring a lead clears its archive stamp and puts it back in
-- the default list. A live lead is not touched, so a restore of one changes
-- no row and leaves updated_at alone.
UPDATE leads.leads
   SET archived_at = NULL
 WHERE id = $1
   AND archived_at IS NOT NULL
RETURNING id, name, phone, email, created_at, updated_at, last_contacted,
          converted, contacted, responded, created_by, updated_by,
          notes, contact, priority,
          assigned_to_id, source, sms_consent_at, sms_consent_method,
          number, source_id, contact_preference_id,
          contacted_at, responded_at, converted_at, archived_at,
          /*__lead_stage__*/ AS lead_stage
