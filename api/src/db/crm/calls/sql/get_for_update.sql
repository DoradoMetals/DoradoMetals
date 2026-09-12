-- Locks the row before an order-tolerant status decision, the same reason
-- crm.sms_messages locks before applying a delivery status.
SELECT id, provider, provider_sid, direction, from_number, to_number, user_id,
       employee_id, status, duration_seconds, recording_url, started_at, ended_at,
       created_at, updated_at, created_by_id, updated_by_id, read_at
  FROM crm.calls
 WHERE provider_sid = $1
   FOR UPDATE
