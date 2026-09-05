-- superseded-by-genesis: core.reviews was dissolved by 013 and does not exist in a genesis
--   build; 029_genesis_backfill.sql copies exchange.reviews into
--   reviews.reviews instead.
--
-- Bring core.reviews' data up to date with exchange.reviews.
--
-- Same shape as the leads backfill: an upsert keyed on id, so it is idempotent
-- and converges on re-run. It writes only to core; exchange stays the source of
-- truth until the feature's switch is promoted.
--
-- user_id and order_id exist only in core and are left null. They are the
-- schema anticipating that a review should be attributable to a customer and an
-- order, which exchange never recorded - there is nothing to backfill them from,
-- and inventing an attribution would be worse than leaving it absent.
--
-- Before running this after a switch has been promoted past dual, check
-- `verify:parity` first. If core holds rows exchange does not, this would
-- overwrite them with stale values.

INSERT INTO core.reviews (
  id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden
)
SELECT
  e.id, e.review_text, e.created_at, e.updated_at, e.rating, e.created_by, e.updated_by, e.name, e.hidden
FROM exchange.reviews e
ON CONFLICT (id) DO UPDATE SET
  review_text = EXCLUDED.review_text,
  created_at  = EXCLUDED.created_at,
  updated_at  = EXCLUDED.updated_at,
  rating      = EXCLUDED.rating,
  created_by  = EXCLUDED.created_by,
  updated_by  = EXCLUDED.updated_by,
  name        = EXCLUDED.name,
  hidden      = EXCLUDED.hidden;
