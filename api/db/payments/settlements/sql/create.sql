-- WHAT ACTUALLY MOVED. An intent records what was asked for; this records the
-- money. In DOLLARS - the caller divides Stripe's cents.
--
-- IDEMPOTENT BY DESIGN: a Stripe webhook is retried, and a retry must rewrite
-- the same row rather than raise or mint a second one.
INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO UPDATE SET settled_amount = EXCLUDED.settled_amount
RETURNING id, attempt_id, settled_amount, provider, provider_ref, settled_at
