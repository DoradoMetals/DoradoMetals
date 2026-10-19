-- THE LEADS SCREEN'S TOTALS LINE AND FOUR STAT TILES, AS ONE READ.
--
-- The same facts and matching rules as funnel.sql beside this file: stage
-- facts are moments, a lead's texts and calls are matched on the last ten
-- digits of its number, its emails on the address, and the email response
-- rate leans on responded_at. The targets are rows in crm.targets.
--
-- An archived lead (ruling 162) counts nowhere. An open lead is one with no
-- converted_at; `unowned` and `needs_attention` count open leads only.
--
-- $1 and $2 are an optional created window, UTC dates, from inclusive and to
-- exclusive; a NULL bound is open. The list filters never reach this read.
-- The weekly history buckets by date_trunc('week') in UTC.
WITH base AS (
  SELECT l.id, l.converted_at, l.contacted_at, l.responded_at, l.assigned_to_id, l.created_at,
         nullif(right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10), '') AS digits,
         nullif(lower(trim(coalesce(l.email, ''))), '') AS email_key
    FROM leads.leads l
   WHERE l.archived_at IS NULL
     AND ($1::date IS NULL OR l.created_at >= ($1::date)::timestamp AT TIME ZONE 'UTC')
     AND ($2::date IS NULL OR l.created_at < ($2::date)::timestamp AT TIME ZONE 'UTC')
),
touched AS (
  SELECT b.id, b.converted_at, b.contacted_at, b.responded_at, b.assigned_to_id, b.created_at,
         coalesce(t.texts_out, 0) AS texts_out,
         coalesce(t.texts_in, 0) AS texts_in,
         coalesce(c.calls_out, 0) AS calls_out,
         coalesce(c.calls_in, 0) AS calls_in,
         coalesce(e.emails_out, 0) AS emails_out,
         extract(epoch FROM (b.contacted_at - b.created_at)) / 3600.0 AS hours_to_first_contact
    FROM base b
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE m.direction = 'outbound') AS texts_out,
             count(*) FILTER (WHERE m.direction = 'inbound') AS texts_in
        FROM crm.sms_messages m
       WHERE b.digits IS NOT NULL
         AND (right(regexp_replace(m.from_number, '\D', '', 'g'), 10) = b.digits
           OR right(regexp_replace(m.to_number, '\D', '', 'g'), 10) = b.digits)
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE k.direction = 'outbound') AS calls_out,
             count(*) FILTER (WHERE k.direction = 'inbound') AS calls_in
        FROM crm.calls k
       WHERE b.digits IS NOT NULL
         AND (right(regexp_replace(k.from_number, '\D', '', 'g'), 10) = b.digits
           OR right(regexp_replace(k.to_number, '\D', '', 'g'), 10) = b.digits)
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS emails_out
        FROM media.emails em
       WHERE b.email_key IS NOT NULL
         AND lower(trim(em.to_address)) = b.email_key
    ) e ON true
),
metrics AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE converted_at IS NULL AND assigned_to_id IS NULL) AS unowned,
         count(*) FILTER (WHERE converted_at IS NULL AND contacted_at IS NULL) AS not_contacted,
         count(*) FILTER (WHERE converted_at IS NOT NULL) AS converted_count,
         count(*) FILTER (WHERE texts_out > 0) AS texted,
         count(*) FILTER (WHERE texts_out > 0 AND texts_in > 0) AS texted_back,
         count(*) FILTER (WHERE calls_out > 0) AS called,
         count(*) FILTER (WHERE calls_out > 0 AND calls_in > 0) AS called_back,
         count(*) FILTER (WHERE emails_out > 0) AS emailed,
         count(*) FILTER (WHERE emails_out > 0 AND responded_at IS NOT NULL) AS emailed_back,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY hours_to_first_contact)
           FILTER (WHERE hours_to_first_contact >= 0) AS median_hours
    FROM touched
),
weeks AS (
  SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start,
         count(*) AS leads,
         count(*) FILTER (WHERE converted_at IS NOT NULL) AS converted
    FROM base
   GROUP BY 1
),
targets AS (
  SELECT max(t.value) FILTER (WHERE t.key = 'lead_conversion_rate') AS conversion_rate,
         max(t.value) FILTER (WHERE t.key = 'lead_hours_to_first_contact') AS hours
    FROM crm.targets t
)
SELECT jsonb_build_object(
         'totals', jsonb_build_object(
           'count', m.total,
           'unowned', m.unowned,
           'median_hours_to_first_contact', round(m.median_hours::numeric, 2)
         ),
         'response_rate_by_channel', jsonb_build_object(
           'text', coalesce(round(m.texted_back::numeric / nullif(m.texted, 0), 4), 0),
           'call', coalesce(round(m.called_back::numeric / nullif(m.called, 0), 4), 0),
           'email', coalesce(round(m.emailed_back::numeric / nullif(m.emailed, 0), 4), 0)
         ),
         'conversion', jsonb_build_object(
           'rate', coalesce(round(m.converted_count::numeric / nullif(m.total, 0), 4), 0),
           'target', t.conversion_rate,
           'history', coalesce(
             (SELECT jsonb_agg(
                       jsonb_build_object(
                         'week_start', to_char(w.week_start, 'YYYY-MM-DD'),
                         'leads', w.leads,
                         'converted', w.converted,
                         'rate', round(w.converted::numeric / w.leads, 4)
                       ) ORDER BY w.week_start)
                FROM weeks w),
             '[]'::jsonb)
         ),
         'first_contact', jsonb_build_object(
           'median_hours', round(m.median_hours::numeric, 2),
           'target_hours', t.hours
         ),
         'needs_attention', jsonb_build_object(
           'unassigned', m.unowned,
           'not_contacted', m.not_contacted
         )
       ) AS summary
  FROM metrics m, targets t
