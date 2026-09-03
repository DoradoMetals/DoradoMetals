-- WHAT ACTUALLY MOVED. An intent records what was asked for; this records the
-- money. In DOLLARS - the caller divides Stripe's cents.
--
-- IDEMPOTENT BY DESIGN: a Stripe webhook is retried, and a retry must rewrite
-- the same row rather than raise or mint a second one.
--
-- settled_at is stamped here, at the first INSERT only (117 made it NOT
-- NULL) - it is the moment this row recorded money moving, and a retry's
-- ON CONFLICT deliberately does not touch it, so a corrected amount never
-- rewrites when the settlement was first seen.
INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (id) DO UPDATE SET settled_amount = EXCLUDED.settled_amount
RETURNING id, attempt_id, settled_amount, provider, provider_ref, settled_at
