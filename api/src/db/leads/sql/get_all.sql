SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority,
       assigned_to_id, source,
       /*__lead_stage__*/ AS lead_stage
  FROM leads.leads
 WHERE ($1::text IS NULL OR /*__lead_stage__*/ = $1)
   AND ($2::text IS NULL OR priority = $2)
   AND ($3::text IS NULL
        OR ($3 = 'unassigned' AND assigned_to_id IS NULL)
        OR ($3 <> 'unassigned' AND assigned_to_id = $3::uuid))
   AND ($4::text IS NULL OR source = $4)
   AND ($5::text IS NULL
        OR name ILIKE '%' || $5 || '%'
        OR phone ILIKE '%' || $5 || '%'
        OR email ILIKE '%' || $5 || '%')
 ORDER BY created_at DESC, id DESC
