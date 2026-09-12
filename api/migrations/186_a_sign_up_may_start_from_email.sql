-- Email-first sign-up (Twilio stuck in compliance review, 2026-09-11): a
-- sign-up may now start from either factor, phone still fully working.
--
-- `auth.pending_signups.phone_number` was NOT NULL and UNIQUE because every
-- sign-up went through the phone. A sign-up with no phone number now inserts
-- NULL there instead. NULL is normal, not a collision - a plain UNIQUE
-- constraint already treats NULLs as distinct - but the phone sign-up's
-- `ON CONFLICT (phone_number)` upsert cannot target a NULL column, so a
-- second email-only attempt at the same email needs its own conflict target:
-- pending_signups_one_email_no_phone, a partial unique index on (email)
-- WHERE phone_number IS NULL.
--
-- `auth.users.phone_number` was already nullable (migration 000, long before
-- this wave). Nothing there changes.
--
-- Purely additive. `exchange` is neither read nor written.
--
-- ROLLBACK: DROP INDEX auth.pending_signups_one_email_no_phone; ALTER TABLE
-- auth.pending_signups ALTER COLUMN phone_number SET NOT NULL - safe only if
-- no email-only row has been written since.

ALTER TABLE auth.pending_signups ALTER COLUMN phone_number DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pending_signups_one_email_no_phone
  ON auth.pending_signups (email)
  WHERE phone_number IS NULL;
