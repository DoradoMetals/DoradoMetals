-- The leads list as CSV, header first, every match in the list's order.
-- $1..$8 are the filters (filter.sql), $9 sort, $10 direction (as get_all).
-- Estimated value is pricing's and stays off the export. A field is quoted
-- and its quotes doubled.
WITH filtered AS (
  SELECT id, number, name, phone, email, created_at, source_id, assigned_to_id,
         CASE WHEN archived_at IS NOT NULL THEN 'Archived'
              ELSE /*__lead_stage__*/ END AS status
    FROM leads.leads
   WHERE /*__lead_filter__*/
),
matched AS (
  SELECT f.*, s.label AS source_label, u.name AS assigned_to_name
    FROM filtered f
    LEFT JOIN leads.sources s ON s.id = f.source_id
    LEFT JOIN auth.users u ON u.id = f.assigned_to_id
),
lines AS (
  SELECT row_number() OVER (
           ORDER BY
             CASE WHEN $9 = 'name' AND $10 = 'asc' THEN lower(m.name) END ASC,
             CASE WHEN $9 = 'name' AND $10 = 'desc' THEN lower(m.name) END DESC,
             CASE WHEN $9 = 'created' AND $10 = 'asc' THEN m.created_at END ASC,
             m.created_at DESC,
             m.id DESC
         ) AS position,
         concat_ws(',',
           '"' || replace(m.number, '"', '""') || '"',
           '"' || replace(m.name, '"', '""') || '"',
           '"' || replace(coalesce(m.phone, ''), '"', '""') || '"',
           '"' || replace(coalesce(m.email, ''), '"', '""') || '"',
           '"' || replace(coalesce(m.source_label, ''), '"', '""') || '"',
           '"' || m.status || '"',
           '"' || replace(coalesce(m.assigned_to_name, ''), '"', '""') || '"',
           '"' || to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '"'
         ) AS line
    FROM matched m
)
SELECT 'number,name,phone,email,source,status,assigned_to,created_at' || E'\n'
       || coalesce(string_agg(line, E'\n' ORDER BY position), '') || E'\n' AS csv
  FROM lines
