-- Two small facts the passwordless wave needs, and neither belongs in 142 or
-- 143: both were found by running the code those two migrations made possible.
--
-- verification_identifier_idx. Every OTP check reads `auth.verification` by
-- `identifier` - `<purpose>-otp-<phone or email>` - and better-auth's own
-- schema declares no index on that column at all, because better-auth reaches
-- the table through its own adapter and never had to answer for the plan. The
-- step-up and both change flows read it on every attempt, and so does every
-- sign-in verify. `audit:query-paths` asks exactly this question: does any
-- index LEAD with the column the query filters on. Nothing did. Dev holds a
-- handful of rows where a sequential scan is genuinely the faster plan, which
-- is the shape of defect that only appears when production row counts arrive
-- at a table nobody measured.
--
-- voicemail_received. A customer who rings the business and reaches nobody
-- leaves a recording, and an employee has to be told. The trail records a send
-- by its `media.email_kind` label, so a send with no label cannot be recorded,
-- cannot be counted and cannot be made idempotent - the label is what makes
-- the notice a fact rather than a hope. 141 added twelve labels for the Figma
-- mailers; this is the thirteenth and it is NOT one of them, because no Figma
-- mailer exists for it. It is an internal notice to staff on the plain base
-- layout, and it is noted in docs/waves/auth-passwordless.md so a design can
-- be drawn for it later.
--
-- Additive: one index and one enum label. No table is touched, no row is
-- rewritten, `exchange` is neither read nor written.
--
-- ROLLBACK: the index would be `DROP INDEX auth.verification_identifier_idx`,
-- which is safe and which this file deliberately does not do. The enum label
-- cannot be removed in place - PostgreSQL has no DROP VALUE - and an unused
-- label costs nothing, which is the same reasoning 141 recorded.

CREATE INDEX IF NOT EXISTS verification_identifier_idx
  ON auth.verification (identifier);

ALTER TYPE media.email_kind ADD VALUE IF NOT EXISTS 'voicemail_received';
