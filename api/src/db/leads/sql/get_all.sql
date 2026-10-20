-- One page of the leads list and the count of every match, as one LeadPage.
-- $1..$8 are the filters (filter.sql). $9 sort (name | estimated_value |
-- created), $10 direction (asc | desc), $11 page, $12 page_size (both NULL
-- answers every match), $13 the lead ids in pricing's estimated-value order
-- when the sort is estimated_value, else NULL.
WITH matched AS (
  SELECT id, name, phone, email, created_at, updated_at, last_contacted,
         converted, contacted, responded, created_by, updated_by,
         notes, contact, priority,
         assigned_to_id, source, sms_consent_at, sms_consent_method,
         number, source_id, contact_preference_id,
         contacted_at, responded_at, converted_at, archived_at,
         /*__lead_stage__*/ AS lead_stage
    FROM leads.leads
   WHERE /*__lead_filter__*/
),
ordered AS (
  SELECT m.*,
         row_number() OVER (
           ORDER BY
             CASE WHEN $9 = 'estimated_value' THEN array_position($13::uuid[], m.id) END ASC,
             CASE WHEN $9 = 'name' AND $10 = 'asc' THEN lower(m.name) END ASC,
             CASE WHEN $9 = 'name' AND $10 = 'desc' THEN lower(m.name) END DESC,
             CASE WHEN $9 = 'created' AND $10 = 'asc' THEN m.created_at END ASC,
             m.created_at DESC,
             m.id DESC
         ) AS position
    FROM matched m
)
SELECT jsonb_build_object(
         'rows', coalesce(
           (SELECT jsonb_agg(to_jsonb(o) - 'position' ORDER BY o.position)
              FROM ordered o
             WHERE $12::int IS NULL
                OR (o.position > (coalesce($11::int, 1) - 1) * $12::int
                    AND o.position <= coalesce($11::int, 1) * $12::int)),
           '[]'::jsonb),
         'total', (SELECT count(*) FROM matched)
       ) AS page
