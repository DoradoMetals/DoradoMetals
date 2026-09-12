-- One row per conversation across crm.sms_messages and crm.calls (a
-- voicemail is a call whose status says so), newest first with any unread
-- conversation first. A conversation groups by user_id when a message
-- carries one, else by the counterparty's own number - a lead has no
-- user_id until it converts (crm/leads' convert action).
WITH messages AS (
  SELECT id, 'sms'::text AS channel, direction::text AS direction, user_id,
         CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS phone,
         coalesce(body, '') AS preview,
         created_at AS at,
         (direction = 'inbound' AND read_at IS NULL) AS unread
    FROM crm.sms_messages

  UNION ALL

  SELECT id,
         CASE WHEN status = 'voicemail' THEN 'voicemail' ELSE 'call' END AS channel,
         direction::text AS direction, user_id,
         CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END AS phone,
         coalesce(recording_url, status::text) AS preview,
         started_at AS at,
         (direction = 'inbound' AND read_at IS NULL) AS unread
    FROM crm.calls
),
grouped AS (
  SELECT coalesce(user_id::text, phone) AS key,
         user_id,
         phone,
         max(at) AS last_message_at,
         count(*) FILTER (WHERE unread) AS unread_count
    FROM messages
   GROUP BY 1, 2, 3
),
latest AS (
  SELECT DISTINCT ON (coalesce(user_id::text, phone))
         coalesce(user_id::text, phone) AS key, channel, preview
    FROM messages
   ORDER BY coalesce(user_id::text, phone), at DESC, id DESC
)
SELECT
  CASE WHEN g.user_id IS NOT NULL THEN 'user:' || g.user_id::text
       ELSE 'phone:' || g.phone END AS key,
  CASE WHEN u.id IS NOT NULL THEN 'customer'
       WHEN l.id IS NOT NULL THEN 'lead'
       ELSE 'unknown' END AS kind,
  coalesce(u.name, l.name) AS name,
  g.phone,
  latest.channel,
  latest.preview,
  to_char(g.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_message_at,
  g.unread_count,
  coalesce(u.assigned_to_id, l.assigned_to_id) AS assigned_to_id
  FROM grouped g
  JOIN latest ON latest.key = g.key
  LEFT JOIN auth.users u ON u.id = g.user_id
  LEFT JOIN LATERAL (
    SELECT ll.id, ll.name, ll.assigned_to_id
      FROM leads.leads ll
     WHERE g.user_id IS NULL
       AND right(regexp_replace(ll.phone, '\D', '', 'g'), 10)
         = right(regexp_replace(g.phone, '\D', '', 'g'), 10)
     ORDER BY ll.created_at DESC
     LIMIT 1
  ) l ON true
 ORDER BY (g.unread_count > 0) DESC, g.last_message_at DESC
