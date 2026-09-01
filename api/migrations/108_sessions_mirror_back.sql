-- THE SESSION MIRROR THE CUTOVER OWED. 107 moved better-auth's writes to
-- auth.* and let exchange.session freeze - sessions are ephemeral, a stale
-- one is a re-login. What that missed: exchange.payment_intents.session_id
-- is an FK onto exchange.session, and the payments feature's exchange half
-- is still LIVE behind PAYMENTS_SOURCE=dual. A session minted after the
-- cutover exists only in auth.sessions, so creating a payment intent under
-- it raised 23503 - a customer failing to check out, exactly as the
-- genesis-verification comment on that FK predicted. Found by the sales
-- drawer-work spec's first real run, hours after the flip.
--
-- So sessions mirror auth -> exchange, insert and update (token refresh moves
-- expiresAt), depth-guarded like the identity mirror. Deletes are not
-- mirrored: better-auth prunes its own table, and exchange keeping a dead
-- session row costs nothing while the FK still points at it.
-- Reversible: DROP TRIGGER mirror_sessions_to_exchange ON auth.sessions;
--             DROP FUNCTION auth.mirror_session_to_exchange();

-- Catch up the rows minted between the cutover and this migration.
INSERT INTO exchange.session (
  id, "userId", token, "expiresAt", "ipAddress", "userAgent",
  "createdAt", "updatedAt", "impersonatedBy"
)
SELECT id, "userId", token, "expiresAt", "ipAddress", "userAgent",
       "createdAt", "updatedAt", "impersonatedBy"
FROM auth.sessions
ON CONFLICT (id) DO UPDATE SET
  token = EXCLUDED.token, "expiresAt" = EXCLUDED."expiresAt",
  "updatedAt" = EXCLUDED."updatedAt", "impersonatedBy" = EXCLUDED."impersonatedBy";

CREATE OR REPLACE FUNCTION auth.mirror_session_to_exchange()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  INSERT INTO exchange.session (
    id, "userId", token, "expiresAt", "ipAddress", "userAgent",
    "createdAt", "updatedAt", "impersonatedBy"
  )
  VALUES (
    NEW.id, NEW."userId", NEW.token, NEW."expiresAt", NEW."ipAddress",
    NEW."userAgent", NEW."createdAt", NEW."updatedAt", NEW."impersonatedBy"
  )
  ON CONFLICT (id) DO UPDATE SET
    token = EXCLUDED.token, "expiresAt" = EXCLUDED."expiresAt",
    "updatedAt" = EXCLUDED."updatedAt", "impersonatedBy" = EXCLUDED."impersonatedBy";
  RETURN NEW;
END;
$$;

CREATE TRIGGER mirror_sessions_to_exchange
  AFTER INSERT OR UPDATE ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION auth.mirror_session_to_exchange();
