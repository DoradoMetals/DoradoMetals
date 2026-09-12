-- The <Record> verb's own action callback: no admin answered, so this call
-- ends as a voicemail. Twilio Advanced does not fold this into the regular
-- status callback shape (no CallStatus/CallDuration fields on it), so it is
-- handled where the TwiML action points, not through crm.calls' status rank.
UPDATE crm.calls
   SET recording_url = $2,
       status = 'voicemail',
       ended_at = now()
 WHERE id = $1
RETURNING id, provider, provider_sid, direction, from_number, to_number, user_id,
          employee_id, status, duration_seconds, recording_url, started_at, ended_at,
          created_at, updated_at, created_by_id, updated_by_id, read_at
