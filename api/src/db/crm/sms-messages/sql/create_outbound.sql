-- Written BEFORE the provider call (the same shape as the email trail), so a
-- send that fails after this still leaves a row. provider_sid is NOT NULL
-- UNIQUE and the real sid is not known yet, so a placeholder holds the slot
-- until mark_sent overwrites it - generated in SQL, never minted in
-- TypeScript.
INSERT INTO crm.sms_messages
       (direction, provider, provider_sid, from_number, to_number, body,
        status, user_id)
VALUES ('outbound', $1, 'pending:' || gen_random_uuid()::text, $2, $3, $4,
        'queued',
        (SELECT id FROM auth.users WHERE phone_number = $3 AND phone_number_verified))
RETURNING id, direction, provider, provider_sid, from_number, to_number, body, media,
          status, error_code, user_id, received_at, sent_at,
          created_at, updated_at, created_by_id, updated_by_id
