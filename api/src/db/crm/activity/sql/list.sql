-- THE ACTIVITY FEED, AS ONE READ OVER FACTS THAT ALREADY EXIST.
--
-- Ten kinds of dated fact about a person, merged here (ruling 71) and
-- labelled from crm.timeline_kinds, so the label a screen draws is a row and
-- not a TypeScript map. No new append-only event table: every verb the design
-- draws has a column or a row behind it already, and five of the ten only
-- became datable in this wave (the lead stage moments, notes, assignments and
-- consent decisions).
--
-- `Raised ... to high priority` is drawn on the same card and is NOT here:
-- leads.leads.priority keeps no history, so that change cannot be
-- reconstructed from any column that exists.
--
-- THE SUBJECT is the person the fact is about - a customer or a lead - and
-- every branch fills exactly one of user_id / lead_id. A text or a call with
-- no user_id is matched to a lead on the last ten digits of the number, the
-- same rule crm/inbox uses; one with neither is dropped, because a row the
-- screen cannot name is not activity, it is noise.
--
-- THE ACTOR is read from the audit columns of whichever table holds the fact.
-- media.emails carries none (api-gaps-people.md §1 row 4), so an email's
-- actor is nobody.
--
-- $1 filters by employee. It accepts EITHER identity, because the two are not
-- yet reconciled (Q12): the audit columns hold an auth.users id, while
-- GET /api/employees answers auth.employees ids. $2 caps the page.
WITH calls AS (
  SELECT id, started_at, direction, created_by_id, user_id,
         CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS phone,
         /*__duration_label__*/ AS duration_label
    FROM crm.calls
),
texts AS (
  SELECT id, created_at, direction, created_by_id, user_id, body,
         CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS phone
    FROM crm.sms_messages
),
facts AS (
  SELECT c.started_at AS at, 'call'::text AS kind, c.created_by_id AS actor_id,
         c.user_id, ld.id AS lead_id,
         (CASE WHEN c.direction = 'outbound' THEN 'Outgoing call' ELSE 'Incoming call' END
           || ' ' || c.duration_label)::text AS summary
    FROM calls c
    LEFT JOIN LATERAL (
      SELECT l.id FROM leads.leads l
       WHERE c.user_id IS NULL
         AND right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)
           = right(regexp_replace(c.phone, '\D', '', 'g'), 10)
       ORDER BY l.created_at DESC
       LIMIT 1
    ) ld ON true

  UNION ALL

  SELECT t.created_at, 'text', t.created_by_id,
         t.user_id, ld.id,
         CASE WHEN t.direction = 'outbound' THEN 'Text sent' ELSE 'Text received' END
    FROM texts t
    LEFT JOIN LATERAL (
      SELECT l.id FROM leads.leads l
       WHERE t.user_id IS NULL
         AND right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)
           = right(regexp_replace(t.phone, '\D', '', 'g'), 10)
       ORDER BY l.created_at DESC
       LIMIT 1
    ) ld ON true

  UNION ALL

  SELECT e.sent_at, 'email', NULL, e.user_id, NULL,
         'Email sent: ' || coalesce(e.subject, e.kind::text)
    FROM media.emails e

  UNION ALL

  SELECT n.created_at, 'note', n.created_by_id, n.user_id, n.lead_id, 'Note added'
    FROM crm.notes n

  UNION ALL

  SELECT g.assigned_at, 'assigned', g.created_by_id, g.user_id, g.lead_id,
         CASE WHEN g.assigned_to_id IS NULL THEN 'Unassigned'
              ELSE 'Assigned to ' || coalesce(a.name, 'an employee') END
    FROM crm.assignments g
    LEFT JOIN auth.users a ON a.id = g.assigned_to_id

  UNION ALL

  SELECT v.at, 'consent', v.created_by_id, v.user_id, v.lead_id,
         CASE WHEN k.key = 'opt_in' THEN 'Texting consent given'
              ELSE 'Texting consent withdrawn' END
    FROM crm.sms_consent_events v
    JOIN crm.sms_consent_kinds k ON k.id = v.kind_id

  UNION ALL

  SELECT d.occurred_at, 'credit', d.created_by_id, d.user_id, NULL,
         d.type || ' of $' || to_char(d.amount, 'FM999999990.00')
    FROM payments.ledger d

  UNION ALL

  SELECT l.created_at, 'created', l.created_by_id, NULL, l.id,
         'Added as a lead'
    FROM leads.leads l

  UNION ALL

  SELECT l.contacted_at, 'contacted', l.updated_by_id, NULL, l.id, 'Marked contacted'
    FROM leads.leads l
   WHERE l.contacted_at IS NOT NULL

  UNION ALL

  SELECT l.responded_at, 'responded', l.updated_by_id, NULL, l.id, 'Marked responded'
    FROM leads.leads l
   WHERE l.responded_at IS NOT NULL

  UNION ALL

  SELECT l.converted_at, 'converted', l.updated_by_id, NULL, l.id, 'Converted to a customer'
    FROM leads.leads l
   WHERE l.converted_at IS NOT NULL
)
SELECT to_char(f.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       f.kind,
       k.label,
       f.actor_id,
       actor.name AS actor_name,
       CASE WHEN f.user_id IS NOT NULL THEN 'customer' ELSE 'lead' END AS subject_kind,
       coalesce(f.user_id, f.lead_id) AS subject_id,
       coalesce(subject.name, lead.name) AS subject_name,
       f.summary
  FROM facts f
  JOIN crm.timeline_kinds k ON k.key = f.kind
  LEFT JOIN auth.users actor ON actor.id = f.actor_id
  LEFT JOIN auth.users subject ON subject.id = f.user_id
  LEFT JOIN leads.leads lead ON lead.id = f.lead_id
 WHERE coalesce(f.user_id, f.lead_id) IS NOT NULL
   AND ($1::uuid IS NULL
        OR f.actor_id = $1::uuid
        OR f.actor_id = (SELECT e.user_id FROM auth.employees e WHERE e.id = $1::uuid))
 ORDER BY f.at DESC, f.kind ASC
 LIMIT coalesce($2::integer, 100)
