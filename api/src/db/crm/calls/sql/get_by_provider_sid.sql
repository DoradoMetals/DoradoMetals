SELECT id, provider, provider_sid, direction, from_number, to_number, user_id,
       employee_id, status, duration_seconds, recording_url, started_at, ended_at,
       created_at, updated_at, created_by_id, updated_by_id, read_at
  FROM crm.calls
 WHERE provider_sid = $1
