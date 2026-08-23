-- Fills what 075 added, from exchange.
--
-- Separate from 074 because that migration has already run; the derivation is
-- the same one, extended. Idempotent, and guarded like every other backfill.
--
-- 075 declared session_id as text and it is a uuid: it is the better-auth
-- session id, not a Stripe checkout session string, which the name does not
-- suggest. Corrected here rather than by editing 075, because 075 has already
-- applied - and the column is empty, so the cast cannot fail on data.

ALTER TABLE payments.intents
  ALTER COLUMN session_id TYPE uuid USING session_id::uuid;

DO $$
DECLARE
  offender text;
BEGIN
  SELECT string_agg(t, ', ') INTO offender FROM (
    SELECT 'payments.intents' t WHERE EXISTS (
      SELECT 1 FROM payments.intents i
      WHERE NOT EXISTS (SELECT 1 FROM exchange.payment_intents e WHERE e.id = i.id))
  ) x;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to backfill intent sessions: % holds rows exchange does not.',
      offender;
  END IF;
END $$;

UPDATE payments.intents i
SET session_id = e.session_id,
    user_id    = e.user_id,
    type       = e.type
FROM exchange.payment_intents e
WHERE e.id = i.id
  AND (i.session_id IS DISTINCT FROM e.session_id
    OR i.user_id    IS DISTINCT FROM e.user_id
    OR i.type       IS DISTINCT FROM e.type);
