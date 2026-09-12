-- provider_sid is the idempotency key: Twilio retries a webhook it did not get
-- a 200 for, so a replay must return the row that already exists rather than
-- raise a uniqueness violation or write a second row. The no-op SET is what
-- makes RETURNING answer on a conflict too - DO NOTHING RETURNING nothing on
-- a duplicate, which is not what a replay needs.
INSERT INTO crm.sms_messages
       (direction, provider, provider_sid, from_number, to_number, body, media,
        status, user_id, received_at)
VALUES ('inbound', $1, $2, $3, $4, $5, $6,
        'received',
        (SELECT id FROM auth.users WHERE phone_number = $3 AND phone_number_verified),
        now())
ON CONFLICT (provider_sid) DO UPDATE SET provider_sid = EXCLUDED.provider_sid
RETURNING id, direction, provider, provider_sid, from_number, to_number, body, media,
          status, error_code, user_id, received_at, sent_at,
          created_at, updated_at, created_by_id, updated_by_id, read_at
