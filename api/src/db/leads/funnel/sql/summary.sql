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
--
-- The deltas compare the window with the one of the same length just before
-- it: [from - (to - from), from), where an open `to` is now. With no `from`,
-- or no lead in the earlier window, every delta is NULL. Rates move in points
-- (x 100), the median in minutes, needs attention in leads.
--
-- counts_by_status answers the list's status chips over the same window:
-- contacted is a lead contacted or responded and not converted, archived the
-- archived leads, all the leads that are not archived.
WITH bounds AS (
  SELECT ($1::date)::timestamp AT TIME ZONE 'UTC' AS from_at,
         ($2::date)::timestamp AT TIME ZONE 'UTC' AS to_at
),
windows AS (
  SELECT 'now'::text AS win, b.from_at, b.to_at FROM bounds b
  UNION ALL
  SELECT 'prev', b.from_at - (coalesce(b.to_at, now()) - b.from_at), b.from_at
    FROM bounds b
   WHERE b.from_at IS NOT NULL
),
base AS (
  SELECT w.win, l.id, l.converted_at, l.contacted_at, l.responded_at, l.assigned_to_id,
         l.created_at,
         nullif(right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10), '') AS digits,
         nullif(lower(trim(coalesce(l.email, ''))), '') AS email_key
    FROM leads.leads l
    JOIN windows w
      ON (w.from_at IS NULL OR l.created_at >= w.from_at)
     AND (w.to_at IS NULL OR l.created_at < w.to_at)
   WHERE l.archived_at IS NULL
),
touched AS (
  SELECT b.win, b.id, b.converted_at, b.contacted_at, b.responded_at, b.assigned_to_id,
         b.created_at,
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
scored AS (
  SELECT t.*,
         (t.texts_out > 0 OR t.calls_out > 0 OR t.emails_out > 0) AS reached,
         ((t.texts_out > 0 AND t.texts_in > 0)
          OR (t.calls_out > 0 AND t.calls_in > 0)
          OR (t.emails_out > 0 AND t.responded_at IS NOT NULL)) AS answered
    FROM touched t
),
metrics AS (
  SELECT w.win,
         count(s.id) AS total,
         count(s.id) FILTER (WHERE s.converted_at IS NULL AND s.assigned_to_id IS NULL) AS unowned,
         count(s.id) FILTER (WHERE s.converted_at IS NULL AND s.contacted_at IS NULL) AS not_contacted,
         count(s.id) FILTER (WHERE s.converted_at IS NULL AND s.assigned_to_id IS NULL
                               AND s.contacted_at IS NULL) AS both_flags,
         count(s.id) FILTER (WHERE s.converted_at IS NULL AND s.contacted_at IS NULL
                               AND s.responded_at IS NULL) AS new_count,
         count(s.id) FILTER (WHERE s.converted_at IS NULL
                               AND (s.contacted_at IS NOT NULL OR s.responded_at IS NOT NULL))
           AS contacted_count,
         count(s.id) FILTER (WHERE s.converted_at IS NOT NULL) AS converted_count,
         count(s.id) FILTER (WHERE s.reached) AS reached,
         count(s.id) FILTER (WHERE s.reached AND s.answered) AS reached_back,
         count(s.id) FILTER (WHERE s.texts_out > 0) AS texted,
         count(s.id) FILTER (WHERE s.texts_out > 0 AND s.texts_in > 0) AS texted_back,
         count(s.id) FILTER (WHERE s.calls_out > 0) AS called,
         count(s.id) FILTER (WHERE s.calls_out > 0 AND s.calls_in > 0) AS called_back,
         count(s.id) FILTER (WHERE s.emails_out > 0) AS emailed,
         count(s.id) FILTER (WHERE s.emails_out > 0 AND s.responded_at IS NOT NULL) AS emailed_back,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY s.hours_to_first_contact)
           FILTER (WHERE s.hours_to_first_contact >= 0) AS median_hours
    FROM windows w
    LEFT JOIN scored s ON s.win = w.win
   GROUP BY w.win
),
rated AS (
  SELECT m.*,
         coalesce(m.reached_back::numeric / nullif(m.reached, 0), 0) AS response_rate,
         coalesce(m.converted_count::numeric / nullif(m.total, 0), 0) AS conversion_rate,
         m.unowned + m.not_contacted - m.both_flags AS attention
    FROM metrics m
),
archived AS (
  SELECT count(*) AS archived
    FROM leads.leads l, bounds b
   WHERE l.archived_at IS NOT NULL
     AND (b.from_at IS NULL OR l.created_at >= b.from_at)
     AND (b.to_at IS NULL OR l.created_at < b.to_at)
),
weeks AS (
  SELECT date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start,
         count(*) AS leads,
         count(*) FILTER (WHERE converted_at IS NOT NULL) AS converted
    FROM base
   WHERE win = 'now'
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
         'counts_by_status', jsonb_build_object(
           'new', m.new_count,
           'contacted', m.contacted_count,
           'converted', m.converted_count,
           'archived', a.archived,
           'all', m.total
         ),
         'response_rate', round(m.response_rate, 4),
         'response_rate_by_channel', jsonb_build_object(
           'text', coalesce(round(m.texted_back::numeric / nullif(m.texted, 0), 4), 0),
           'call', coalesce(round(m.called_back::numeric / nullif(m.called, 0), 4), 0),
           'email', coalesce(round(m.emailed_back::numeric / nullif(m.emailed, 0), 4), 0)
         ),
         'conversion', jsonb_build_object(
           'rate', round(m.conversion_rate, 4),
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
           'not_contacted', m.not_contacted,
           'both', m.both_flags,
           'total', m.attention
         ),
         'deltas', jsonb_build_object(
           'response_rate_pts', round((m.response_rate - p.response_rate) * 100, 2),
           'conversion_rate_pts', round((m.conversion_rate - p.conversion_rate) * 100, 2),
           'median_first_contact_minutes',
             round(((m.median_hours - p.median_hours) * 60)::numeric, 0),
           'needs_attention', m.attention - p.attention
         )
       ) AS summary
  FROM rated m
  CROSS JOIN targets t
  CROSS JOIN archived a
  LEFT JOIN rated p ON p.win = 'prev' AND p.total > 0
 WHERE m.win = 'now'
