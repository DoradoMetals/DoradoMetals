-- THE LEAD'S TIMELINE. Eleven kinds of fact that already exist somewhere,
-- merged into one read (ruling 71) and labelled from crm.timeline_kinds, so
-- the label a screen draws is a row and not a TypeScript map.
--
-- A lead has no auth.users row, so its texts and calls are matched the way the
-- inbox matches them: on the last ten digits of the number. Its emails are
-- matched on the address.
--
-- THREE BRANCHES NOW READ ROWS INSTEAD OF COLUMNS.
--   note      crm.notes (migration 252), one row per note with its own author
--             and date. leads.leads.notes is NOT read here any more: the
--             column was backfilled into that table as one row, so reading
--             both would show every carried-over note twice.
--   consent   crm.sms_consent_events (migration 254), in BOTH directions. The
--             old branch could only ever show consent being GIVEN, because an
--             opt-out nulled the one column it read.
--   assigned  crm.assignments (migration 253), one row per assignment, so a
--             reassignment shows as two rows rather than one row redated by
--             whatever last touched the lead.
--
-- contacted / responded / converted are the MOMENTS migration 251 put on the
-- row, so each is its own dated entry instead of a boolean with no date.
--
-- The ACTOR is read from the audit columns of whichever table holds the fact.
-- media.emails carries none, so an email's actor is nobody - true, and better
-- than attributing it to whoever last edited the lead.
WITH l AS (
  SELECT id, name, number, created_at, updated_at,
         created_by_id, updated_by_id, assigned_to_id,
         contacted_at, responded_at, converted_at, source_id,
         nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '') AS digits,
         nullif(lower(trim(coalesce(email, ''))), '') AS email_key
    FROM leads.leads
   WHERE id = $1
),
facts AS (
  SELECT l.created_at AS at,
         'created'::text AS kind,
         l.created_by_id AS actor_id,
         ('Lead ' || l.number || ' created')::text AS summary,
         (SELECT s.label FROM leads.sources s WHERE s.id = l.source_id)::text AS detail
    FROM l

  UNION ALL

  SELECT g.assigned_at, 'assigned', g.created_by_id,
         CASE WHEN g.assigned_to_id IS NULL THEN 'Unassigned'
              ELSE 'Assigned to ' || coalesce(a.name, 'an employee') END,
         NULL
    FROM l
    JOIN crm.assignments g ON g.lead_id = l.id
    LEFT JOIN auth.users a ON a.id = g.assigned_to_id

  UNION ALL

  SELECT c.started_at, 'call', c.created_by_id,
         CASE WHEN c.direction = 'outbound' THEN 'Outgoing call' ELSE 'Incoming call' END,
         coalesce(c.recording_url, c.status::text)
    FROM l
    JOIN crm.calls c
      ON l.digits IS NOT NULL
     AND (right(regexp_replace(c.from_number, '\D', '', 'g'), 10) = l.digits
       OR right(regexp_replace(c.to_number, '\D', '', 'g'), 10) = l.digits)

  UNION ALL

  SELECT m.created_at, 'text', m.created_by_id,
         CASE WHEN m.direction = 'outbound' THEN 'Text sent' ELSE 'Text received' END,
         m.body
    FROM l
    JOIN crm.sms_messages m
      ON l.digits IS NOT NULL
     AND (right(regexp_replace(m.from_number, '\D', '', 'g'), 10) = l.digits
       OR right(regexp_replace(m.to_number, '\D', '', 'g'), 10) = l.digits)

  UNION ALL

  SELECT e.sent_at, 'email', NULL,
         'Email sent', coalesce(e.subject, e.kind::text)
    FROM l
    JOIN media.emails e ON l.email_key IS NOT NULL
                       AND lower(trim(e.to_address)) = l.email_key

  UNION ALL

  SELECT n.created_at, 'note', n.created_by_id, 'Note', n.body
    FROM l
    JOIN crm.notes n ON n.lead_id = l.id

  UNION ALL

  SELECT v.at, 'consent', v.created_by_id,
         CASE WHEN k.key = 'opt_in' THEN 'Texting consent given'
              ELSE 'Texting consent withdrawn' END,
         v.method
    FROM l
    JOIN crm.sms_consent_events v ON v.lead_id = l.id
    JOIN crm.sms_consent_kinds k ON k.id = v.kind_id

  UNION ALL

  SELECT i.created_at, 'estimate_item', i.created_by_id,
         i.weight::text || ' ' || u.label || ' ' || i.metal_id,
         coalesce(p.label, (i.custom_purity * 100)::text || '% fine')
    FROM l
    JOIN leads.estimate_items i ON i.lead_id = l.id
    JOIN leads.weight_units u ON u.id = i.unit_id
    LEFT JOIN metals.purity_labels p ON p.id = i.purity_id

  UNION ALL

  SELECT l.contacted_at, 'contacted', l.updated_by_id, 'Marked contacted', NULL
    FROM l
   WHERE l.contacted_at IS NOT NULL

  UNION ALL

  SELECT l.responded_at, 'responded', l.updated_by_id, 'Marked responded', NULL
    FROM l
   WHERE l.responded_at IS NOT NULL

  UNION ALL

  SELECT l.converted_at, 'converted', l.updated_by_id,
         'Converted to a customer', NULL
    FROM l
   WHERE l.converted_at IS NOT NULL
)
SELECT to_char(f.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       f.kind,
       k.label,
       f.actor_id,
       u.name AS actor_name,
       f.summary,
       f.detail
  FROM facts f
  JOIN crm.timeline_kinds k ON k.key = f.kind
  LEFT JOIN auth.users u ON u.id = f.actor_id
 ORDER BY at ASC, f.kind ASC
