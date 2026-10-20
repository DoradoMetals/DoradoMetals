-- THE LEADS LIST'S FILTERS, shared by the list, its export and the matching
-- ids the estimated-value sort ranks. Substituted into a WHERE over
-- leads.leads with no alias. The positions are fixed:
--   $1 stage   $2 priority   $3 assigned_to (an id or 'unassigned')
--   $4 source_id   $5 search over name, phone and email   $6 archived
--   $7 created_from   $8 created_to (UTC dates, from inclusive, to exclusive)
-- The Contacted chip lists a lead contacted or responded and not converted.
($1::text IS NULL
   OR /*__lead_stage__*/ = $1
   OR ($1 = 'Contacted' AND /*__lead_stage__*/ = 'Responded'))
AND ($2::text IS NULL OR priority = $2)
AND ($3::text IS NULL
     OR ($3 = 'unassigned' AND assigned_to_id IS NULL)
     OR ($3 <> 'unassigned' AND assigned_to_id = $3::uuid))
AND ($4::uuid IS NULL OR source_id = $4)
AND ($5::text IS NULL
     OR name ILIKE '%' || $5 || '%'
     OR phone ILIKE '%' || $5 || '%'
     OR email ILIKE '%' || $5 || '%')
AND (archived_at IS NOT NULL) = $6::boolean
AND ($7::date IS NULL OR created_at >= ($7::date)::timestamp AT TIME ZONE 'UTC')
AND ($8::date IS NULL OR created_at < ($8::date)::timestamp AT TIME ZONE 'UTC')
