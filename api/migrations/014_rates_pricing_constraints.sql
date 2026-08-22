-- Restore the constraints rates.rates lost relative to exchange.rates.
--
-- exchange protects rate bands three ways; the new table carried only a weaker
-- version of one of them:
--
--   rates_min_nonneg      min_qty >= 0                    absent
--   rates_max_gt_min      max_qty > min_qty               present but as >=,
--                                                         which permits a
--                                                         zero-width band
--   rates_no_overlap_qty  no two bands for the same       absent
--                         metal and unit may overlap
--
-- The exclusion constraint is the one that matters. getRateBand picks the first
-- band whose range contains the quantity, so two overlapping bands make the
-- premium depend on row order - the same order could be priced differently on
-- two requests. That feeds bid_spot * premium, so it is a pricing bug rather
-- than a display one.
--
-- Checked against the data first: no overlapping bands, no zero-width or
-- negative ranges, no negative minimums. So these are additive, and would fail
-- the migration rather than silently drop a row if that were not true.
--
-- btree_gist is already installed - it is what lets a gist exclusion mix
-- equality on metal_id and unit with range overlap on the quantity.

ALTER TABLE rates.rates
  DROP CONSTRAINT IF EXISTS migration_rates_qty_chk;

ALTER TABLE rates.rates
  ADD CONSTRAINT rates_min_nonneg CHECK (min_qty >= 0),
  ADD CONSTRAINT rates_max_gt_min CHECK (max_qty IS NULL OR max_qty > min_qty);

ALTER TABLE rates.rates
  ADD CONSTRAINT rates_no_overlap_qty
  EXCLUDE USING gist (
    metal_id WITH =,
    unit WITH =,
    numrange(min_qty, max_qty, '[)') WITH &&
  );
