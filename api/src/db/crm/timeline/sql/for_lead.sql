-- THE LEAD'S TIMELINE. Nine kinds of fact that already exist somewhere, merged
-- into one read (ruling 71) and labelled from crm.timeline_kinds, so the label
-- a screen draws is a row and not a TypeScript map.
--
-- A lead has no auth.users row, so its texts and calls are matched the way the
-- inbox matches them: on the last ten digits of the number. Its emails are
-- matched on the address.
--
-- The ACTOR is read from the audit columns of whichever table holds the fact.
-- media.emails carries none, so an email's actor is nobody - true, and better
-- than attributing it to whoever last edited the lead.
WITH l AS (
  SELECT id, name, number, notes, created_at, updated_at,
         created_by_id, updated_by_id, assigned_to_id, converted,
         sms_consent_at, sms_consent_method, source_id,
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

  SELECT l.updated_at, 'assigned', l.updated_by_id,
         'Assigned to ' || coalesce(a.name, 'an employee'), NULL
    FROM l
    LEFT JOIN auth.users a ON a.id = l.assigned_to_id
   WHERE l.assigned_to_id IS NOT NULL

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

  SELECT l.updated_at, 'note', l.updated_by_id, 'Note', l.notes
    FROM l
   WHERE l.notes IS NOT NULL

  UNION ALL

  SELECT l.sms_consent_at, 'consent', l.updated_by_id,
         'Texting consent given', l.sms_consent_method
    FROM l
   WHERE l.sms_consent_at IS NOT NULL

  UNION ALL

  SELECT i.created_at, 'estimate_item', i.created_by_id,
         i.weight::text || ' ' || u.label || ' ' || i.metal_id,
         coalesce(p.label, (i.custom_purity * 100)::text || '% fine')
    FROM l
    JOIN leads.estimate_items i ON i.lead_id = l.id
    JOIN leads.weight_units u ON u.id = i.unit_id
    LEFT JOIN metals.purity_labels p ON p.id = i.purity_id

  UNION ALL

  SELECT l.updated_at, 'converted', l.updated_by_id,
         'Converted to a customer', NULL
    FROM l
   WHERE l.converted
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
