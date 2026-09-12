SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority, assigned_to_id, source
  FROM leads.leads
 ORDER BY created_at DESC, id DESC
