-- THE LEAD FUNNEL, AS ONE READ.
--
-- Every number here is derived; none is stored, and none is computed in a
-- browser. The two TARGETS are rows in crm.targets (ruling 116), so Jacob
-- moves them with an UPDATE and no deploy.
--
-- A lead has no auth.users row, so its texts and calls are matched on the last
-- ten digits of its number - the same rule crm/inbox already uses - and its
-- emails on the address.
--
-- The email response rate leans on leads.leads.responded, because no inbound
-- email is recorded anywhere: there is no media.emails row for a reply. Text
-- and call rates are measured from real inbound rows.
WITH base AS (
  SELECT l.id, l.converted, l.contacted, l.responded, l.assigned_to_id, l.created_at,
         nullif(right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10), '') AS digits,
         nullif(lower(trim(coalesce(l.email, ''))), '') AS email_key
    FROM leads.leads l
),
touched AS (
  SELECT b.id, b.converted, b.contacted, b.responded, b.assigned_to_id,
         coalesce(t.texts_out, 0) AS texts_out,
         coalesce(t.texts_in, 0) AS texts_in,
         coalesce(c.calls_out, 0) AS calls_out,
         coalesce(c.calls_in, 0) AS calls_in,
         coalesce(e.emails_out, 0) AS emails_out,
         extract(epoch FROM (
           least(t.first_text_out, c.first_call_out, e.first_email_out) - b.created_at
         )) / 3600.0 AS hours_to_first_contact
    FROM base b
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE m.direction = 'outbound') AS texts_out,
             count(*) FILTER (WHERE m.direction = 'inbound') AS texts_in,
             min(m.created_at) FILTER (WHERE m.direction = 'outbound') AS first_text_out
        FROM crm.sms_messages m
       WHERE b.digits IS NOT NULL
         AND (right(regexp_replace(m.from_number, '\D', '', 'g'), 10) = b.digits
           OR right(regexp_replace(m.to_number, '\D', '', 'g'), 10) = b.digits)
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE k.direction = 'outbound') AS calls_out,
             count(*) FILTER (WHERE k.direction = 'inbound') AS calls_in,
             min(k.started_at) FILTER (WHERE k.direction = 'outbound') AS first_call_out
        FROM crm.calls k
       WHERE b.digits IS NOT NULL
         AND (right(regexp_replace(k.from_number, '\D', '', 'g'), 10) = b.digits
           OR right(regexp_replace(k.to_number, '\D', '', 'g'), 10) = b.digits)
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS emails_out, min(em.sent_at) AS first_email_out
        FROM media.emails em
       WHERE b.email_key IS NOT NULL
         AND lower(trim(em.to_address)) = b.email_key
    ) e ON true
),
metrics AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE NOT converted) AS open_count,
         count(*) FILTER (WHERE NOT converted AND assigned_to_id IS NULL) AS unassigned,
         count(*) FILTER (WHERE NOT converted AND NOT contacted) AS never_contacted,
         count(*) FILTER (
           WHERE NOT converted AND assigned_to_id IS NULL AND NOT contacted
         ) AS both,
         count(*) FILTER (WHERE converted) AS converted_count,
         count(*) FILTER (WHERE texts_out > 0) AS texted,
         count(*) FILTER (WHERE texts_out > 0 AND texts_in > 0) AS texted_back,
         count(*) FILTER (WHERE calls_out > 0) AS called,
         count(*) FILTER (WHERE calls_out > 0 AND calls_in > 0) AS called_back,
         count(*) FILTER (WHERE emails_out > 0) AS emailed,
         count(*) FILTER (WHERE emails_out > 0 AND responded) AS emailed_back,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY hours_to_first_contact)
           FILTER (WHERE hours_to_first_contact >= 0) AS median_hours
    FROM touched
),
targets AS (
  SELECT max(t.value) FILTER (WHERE t.key = 'lead_conversion_rate') AS conversion_rate,
         max(t.value) FILTER (WHERE t.key = 'lead_hours_to_first_contact') AS hours
    FROM crm.targets t
)
SELECT jsonb_build_object(
         'open', m.open_count,
         'unassigned', m.unassigned,
         'never_contacted', m.never_contacted,
         'both', m.both,
         'response_rate_by_channel', jsonb_build_object(
           'text', coalesce(round(m.texted_back::numeric / nullif(m.texted, 0), 4), 0),
           'call', coalesce(round(m.called_back::numeric / nullif(m.called, 0), 4), 0),
           'email', coalesce(round(m.emailed_back::numeric / nullif(m.emailed, 0), 4), 0)
         ),
         'conversion_rate', coalesce(
           round(m.converted_count::numeric / nullif(m.total, 0), 4), 0),
         'median_hours_to_first_contact', round(m.median_hours::numeric, 2),
         'conversion_rate_target', t.conversion_rate,
         'hours_to_first_contact_target', t.hours
       ) AS funnel
  FROM metrics m, targets t
