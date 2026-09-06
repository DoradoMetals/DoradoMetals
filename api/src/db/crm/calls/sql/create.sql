-- provider_sid is Twilio's CallSid, known at the very first webhook hit (unlike
-- an outbound SMS send, there is no placeholder step). ON CONFLICT still
-- guards a retried initial webhook the way the sms inbound upsert does.
INSERT INTO crm.calls
       (provider, provider_sid, direction, from_number, to_number, employee_id,
        status, user_id)
VALUES ($1, $2, $3::crm.call_direction, $4, $5, $6, $7::crm.call_status,
        (SELECT id FROM auth.users WHERE phone_number = $8 AND phone_number_verified))
ON CONFLICT (provider_sid) DO UPDATE SET provider_sid = EXCLUDED.provider_sid
RETURNING id, provider, provider_sid, direction, from_number, to_number, user_id,
          employee_id, status, duration_seconds, recording_url, started_at, ended_at,
          created_at, updated_at, created_by_id, updated_by_id
