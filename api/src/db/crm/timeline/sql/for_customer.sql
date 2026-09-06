-- One merged read across three tables, oldest first (newest last) so the
-- message component renders it top-to-bottom as a feed. Built in SQL, not
-- stitched from three separate reads in TypeScript (ruling 71). `at` is
-- formatted here, not left as a native timestamptz - CustomerTimeline is a
-- wire contract (a string), and the fixed-width ISO format still sorts
-- correctly as text.
SELECT m.id, 'sms'::text AS kind,
       to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       m.direction::text AS direction,
       coalesce(m.body, '') AS summary, m.status::text AS status
  FROM crm.sms_messages m
 WHERE m.user_id = $1

UNION ALL

SELECT c.id, 'call'::text AS kind,
       to_char(c.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       c.direction::text AS direction,
       coalesce(c.recording_url, c.status::text) AS summary, c.status::text AS status
  FROM crm.calls c
 WHERE c.user_id = $1

UNION ALL

SELECT e.id, 'email'::text AS kind,
       to_char(e.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       'outbound'::text AS direction,
       coalesce(e.subject, e.kind::text) AS summary, e.status::text AS status
  FROM media.emails e
 WHERE e.user_id = $1

 ORDER BY at ASC, id
