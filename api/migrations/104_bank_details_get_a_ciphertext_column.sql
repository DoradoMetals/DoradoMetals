-- Somewhere for an encrypted routing number to land, which has never existed.
--
-- *** THE PROBLEM THIS CLOSES. *** 073's header and verify-backfill.mjs both
-- describe `scripts/encrypt-payout-details.mjs` as the mechanism that writes
-- the bank numbers into payments.details. It is written now, as
-- scripts/encrypt-payout-details.ts - the extension changed because scripts/
-- is mid-conversion to TypeScript (D157), and the two citations were
-- corrected to point at the file rather than the file being named after the
-- citation that was itself the defect.
-- the bank numbers into payments.details, encrypted, refusing to run without
-- PAYOUT_ENCRYPTION_KEY. That script was never written, and neither were the
-- columns it would write to. The design was documented in two places as
-- though it existed and the plaintext stayed plaintext: 10 ACH + 8 WIRE
-- production rows in exchange.payouts carrying routing and account numbers in
-- the clear, which is the oldest standing constraint in CLAUDE.md.
--
-- *** WHY NOT REUSE routing_number / account_number. *** They are already on
-- this table - text, and after 071 all-NULL, because 071 deleted January's
-- copy and 073 refused to re-create it. Putting ciphertext in a column named
-- `routing_number` is a trap: every future reader, and every projection
-- written by someone who has not read 071, sees a column name that promises a
-- routing number. The one thing worse than plaintext in a known place is
-- ciphertext in a place everyone believes is plaintext, or the reverse. New
-- columns, named for what they hold.
--
-- *** THE ENVELOPE. *** One self-describing string per secret:
--
--   v1.<key_id>.<iv_b64>.<tag_b64>.<ciphertext_b64>
--
-- AES-256-GCM, a fresh 12-byte IV per value, the GCM tag carried alongside.
-- Base64's alphabet is A-Za-z0-9+/= and contains no '.', so the separator
-- cannot collide with the payload. The version prefix is there so a future
-- cipher change is a parse, not a guess.
--
-- AAD binds each ciphertext to `<details.id>:<column>`, so a ciphertext moved
-- to another customer's row - or from the routing column to the account
-- column - fails authentication instead of decrypting into the wrong life.
--
-- *** encryption_key_id IS A COLUMN AND NOT ONLY AN ENVELOPE FIELD. *** It is
-- duplicated on purpose. Rotation needs to FIND the rows still under the old
-- key, and `WHERE encryption_key_id = $1` is an index-able predicate where
-- parsing 18 envelopes in JavaScript is not. Encryption at rest that cannot
-- be rotated is a future incident.
--
-- *** NO PLAINTEXT IS CLEARED HERE, AND THAT IS DELIBERATE. *** Write, then
-- verify by decrypting, and only then a separate migration clears
-- exchange.payouts.routing_number / account_number - which is a destructive
-- change to `exchange` and therefore needs an explicit `allow-destructive:`
-- marker, a stated backup, and Jacob. This migration adds three nullable
-- columns and reads nothing.
--
-- Additive. exchange is not read, not written, not dropped.
--
-- Reversible:
--   ALTER TABLE payments.details
--     DROP COLUMN routing_number_encrypted,
--     DROP COLUMN account_number_encrypted,
--     DROP COLUMN encryption_key_id;
ALTER TABLE payments.details
  ADD COLUMN IF NOT EXISTS routing_number_encrypted text;

ALTER TABLE payments.details
  ADD COLUMN IF NOT EXISTS account_number_encrypted text;

ALTER TABLE payments.details
  ADD COLUMN IF NOT EXISTS encryption_key_id text;

COMMENT ON COLUMN payments.details.routing_number_encrypted IS
  'AES-256-GCM envelope: v1.<key_id>.<iv_b64>.<tag_b64>.<ct_b64>. AAD is <id>:routing_number. Written by scripts/encrypt-payout-details.ts. Never logged, never returned except through the admin details endpoint.';

COMMENT ON COLUMN payments.details.account_number_encrypted IS
  'AES-256-GCM envelope: v1.<key_id>.<iv_b64>.<tag_b64>.<ct_b64>. AAD is <id>:account_number. Written by scripts/encrypt-payout-details.ts. Never logged, never returned except through the admin details endpoint.';

COMMENT ON COLUMN payments.details.encryption_key_id IS
  'Which key the two envelope columns on this row were sealed under. Duplicated from inside the envelope so rotation can find rows by predicate.';

-- The rows still holding January's plaintext, if any survive. 071 removed them
-- from production's payments.details and has never run there; this index makes
-- "which rows are still unencrypted" a seek rather than a scan, on the one
-- table where that question gets asked under time pressure.
CREATE INDEX IF NOT EXISTS details_encryption_key_id_idx
  ON payments.details (encryption_key_id);
