-- The visitors nobody has been for a while.
--
-- LAST SEEN IS THE NEWEST OF THREE TRACES, because none of them alone is the
-- truth. auth.users."updatedAt" is the moment the visitor arrived and never
-- moves again - nothing updates an anonymous row. The SESSION moves as
-- better-auth refreshes it, which is what "still browsing" looks like. The
-- BASKET moves on every PUT, which is what "still shopping" looks like. A
-- visitor who filled a basket an hour ago and closed the tab is not stale
-- because their user row is a week old.
--
-- A LINKED VISITOR IS STALE THE MOMENT IT IS LINKED, and that is deliberate:
-- signing up moves the basket onto the real account (domain/checkout/adopt.ts)
-- and mints a session for the REAL user, so the anonymous row stops accruing
-- traces and falls out on the next sweep after the window.
--
-- LIMIT is the safety on a first run against a database with a year of
-- visitors in it: the sweep deletes a bounded batch per tick rather than
-- taking one enormous lock.
SELECT u.id,
       GREATEST(
         u."updatedAt",
         COALESCE(s.last_session, u."updatedAt"),
         COALESCE(i.last_item,    u."updatedAt")
       ) AS last_seen
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT max(s."updatedAt") AS last_session
      FROM auth.sessions s
     WHERE s."userId" = u.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT max(i.updated_at) AS last_item
      FROM checkout.checkouts c
      JOIN checkout.items i ON i.checkout_id = c.id
     WHERE c.user_id = u.id
  ) i ON true
 WHERE u."isAnonymous"
   AND GREATEST(
         u."updatedAt",
         COALESCE(s.last_session, u."updatedAt"),
         COALESCE(i.last_item,    u."updatedAt")
       ) < $1
 ORDER BY last_seen
 LIMIT $2
