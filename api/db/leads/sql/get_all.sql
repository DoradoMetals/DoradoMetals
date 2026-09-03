-- Every lead, newest first. id breaks ties on created_at for a stable order.
SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority
  FROM leads.leads
 ORDER BY created_at DESC, id DESC
