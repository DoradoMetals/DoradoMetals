-- One merged read across five tables, oldest first (newest last) so the
-- message component renders it top-to-bottom as a feed. Built in SQL, not
-- stitched from five separate reads in TypeScript (ruling 71). `at` is
-- formatted here, not left as a native timestamptz - CustomerTimeline is a
-- wire contract (a string), and the fixed-width ISO format still sorts
-- correctly as text.
--
-- THE ACTOR IS ON EVERY ROW THAT HAS ONE, read from the audit columns of
-- whichever table holds the fact: crm.sms_messages, crm.calls, crm.notes and
-- orders.orders all carry created_by_id. media.emails carries none, so an
-- email's actor is nobody - true, and better than a guess.
--
-- A CALL NO LONGER PUTS ITS RECORDING URL IN THE HEADLINE. `summary` used to
-- be coalesce(recording_url, status), so a recorded call rendered a raw
-- provider URL as the line a person reads. The length is the line the design
-- draws, formatted by db/crm/calls/sql/duration_label.sql, and the recording
-- gets its own field for a screen that wants to play it.
--
-- NOTES ARE ROWS (migration 252), so a customer's notes appear once each with
-- their own author and date. auth.users.notes is NOT read here any more: the
-- column was backfilled into crm.notes as one row, and this branch used to be
-- a single synthetic entry dated by auth.users."updatedAt" - which a ban, an
-- assignment or a credit adjustment silently redated.
WITH facts AS (
SELECT m.id, 'sms'::text AS kind,
       to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       m.direction::text AS direction,
       coalesce(m.body, '') AS summary, m.status::text AS status,
       NULL::text AS call_kind,
       NULL::integer AS duration_seconds,
       NULL::text AS recording_url,
       m.created_by_id AS actor_id
  FROM crm.sms_messages m
 WHERE m.user_id = $1

UNION ALL

SELECT c.id, 'call'::text AS kind,
       to_char(c.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       c.direction::text AS direction,
       /*__duration_label__*/ AS summary, c.status::text AS status,
       -- The four Call Event rows the design draws. Direction and status
       -- together say which one a call is, and the pairing is made here so no
       -- browser makes it (GAP 29).
       CASE WHEN c.direction = 'outbound'
                 AND c.status IN ('no-answer', 'busy', 'canceled', 'failed')
              THEN 'No answer'
            WHEN c.direction = 'outbound' THEN 'Outgoing'
            WHEN c.status IN ('no-answer', 'busy', 'canceled', 'failed', 'voicemail')
              THEN 'Missed'
            ELSE 'Incoming' END AS call_kind,
       c.duration_seconds,
       c.recording_url,
       c.created_by_id AS actor_id
  FROM crm.calls c
 WHERE c.user_id = $1

UNION ALL

SELECT e.id, 'email'::text AS kind,
       to_char(e.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       'outbound'::text AS direction,
       coalesce(e.subject, e.kind::text) AS summary, e.status::text AS status,
       NULL::text AS call_kind,
       NULL::integer AS duration_seconds,
       NULL::text AS recording_url,
       NULL::uuid AS actor_id
  FROM media.emails e
 WHERE e.user_id = $1

UNION ALL

-- The order's own reference format duplicated as a one-line CASE rather than
-- reused from db/orders (too small a fragment to justify a cross-domain
-- export). The status column below is ORDER_STATE reused as-is, because that
-- ladder is exactly the fragment orders/list.sql and places already share.
SELECT o.id, 'order'::text AS kind,
       to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       'outbound'::text AS direction,
       (CASE WHEN o.direction = 'sale' THEN 'SO-' ELSE 'PO-' END || o.number) AS summary,
       /*__order_state__*/ AS status,
       NULL::text AS call_kind,
       NULL::integer AS duration_seconds,
       NULL::text AS recording_url,
       o.created_by_id AS actor_id
  FROM orders.orders o
 WHERE o.user_id = $1

UNION ALL

SELECT n.id, 'note'::text AS kind,
       to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,
       'outbound'::text AS direction,
       n.body AS summary, 'noted'::text AS status,
       NULL::text AS call_kind,
       NULL::integer AS duration_seconds,
       NULL::text AS recording_url,
       n.created_by_id AS actor_id
  FROM crm.notes n
 WHERE n.user_id = $1

)
SELECT f.id, f.kind, f.at, f.direction, f.summary, f.status, f.call_kind,
       f.duration_seconds, f.recording_url, f.actor_id,
       u.name AS actor_name
  FROM facts f
  LEFT JOIN auth.users u ON u.id = f.actor_id
 ORDER BY f.at ASC, f.id
