-- An intent: what was ASKED FOR. What was TRIED is payments.attempts, and what
-- SETTLED is payments.settlements - so the provider's reference for the charge
-- lives on the attempt, not here.
--
-- MONEY IS IN DOLLARS. Stripe speaks cents; the caller divides before this.
--
-- No audit columns: public.audit_stamp writes them (migration 116).
INSERT INTO payments.intents
       (id, session_id, user_id, type, status, amount_expected, order_id, details_id, method_id)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, order_id, method_id, details_id, amount_expected, status,
       created_at, updated_at, created_by, updated_by,
       created_by_id, updated_by_id, session_id, user_id, type
