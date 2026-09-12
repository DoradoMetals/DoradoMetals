UPDATE crm.calls
   SET status = $2::crm.call_status,
       duration_seconds = COALESCE($3, duration_seconds),
       ended_at = CASE
         WHEN $2::crm.call_status IN ('completed', 'busy', 'no-answer', 'failed', 'canceled')
           THEN now()
         ELSE ended_at
       END
 WHERE id = $1
RETURNING id, provider, provider_sid, direction, from_number, to_number, user_id,
          employee_id, status, duration_seconds, recording_url, started_at, ended_at,
          created_at, updated_at, created_by_id, updated_by_id, read_at
