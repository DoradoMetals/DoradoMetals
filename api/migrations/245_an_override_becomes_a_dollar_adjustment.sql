-- THE OVERRIDES MOVE INTO THE ADJUSTMENTS, AS DOLLARS.
--
-- docs/waves/pricing-resolver.md item 3. spots.overrides held an ABSOLUTE
-- bid/ask pair per metal. An adjustment is signed and relative, so the honest
-- translation of "hold Gold at 2400/2410" against a feed quoting 2411.20/
-- 2412.80 is "bid -11.20, ask -2.80, in dollars" - the same two numbers, still
-- tracking nothing, but now expressed in the one vocabulary every price reads.
-- A percent translation would have been a second guess on top of the first.
--
-- The source is the metal's ACTIVE one (migration 240 seeds that to `nfusion`,
-- the one feed that exists), because that is the pair the resolver applies.
-- The reason, the expiry and the enabled state carry across unchanged.
--
-- spots.overrides IS NOT DROPPED AND NOT EMPTIED. Verify before dropping: the
-- old table stays until the mapped rows have been read on the screens and
-- Jacob says the column may go. Nothing reads spots.overrides after this wave,
-- so a stale row there cannot price anything.
--
-- ON CONFLICT DO NOTHING, so a re-run adds nothing and a pair an admin has
-- since edited by hand is never overwritten by a replay of this file.
--
-- dev holds 0 override rows, so this maps nothing there. It exists for the
-- production chain, where the table may hold one.
--
-- `exchange` is neither read nor written.

INSERT INTO spots.adjustments (metal_id, source_id, bid_amount, ask_amount, unit, reason,
                               expires_at, created_at, updated_at,
                               created_by, created_by_id, updated_by, updated_by_id)
SELECT ov.metal_id,
       a.source_id,
       ov.bid - s.bid,
       ov.ask - s.ask,
       'dollars',
       ov.reason,
       ov.expires_at,
       ov.created_at,
       ov.updated_at,
       ov.created_by,
       ov.created_by_id,
       ov.updated_by,
       ov.updated_by_id
  FROM spots.overrides ov
  JOIN spots.active_sources a ON a.metal_id = ov.metal_id
  JOIN spots.spots s ON s.metal_id = ov.metal_id
 WHERE s.bid IS NOT NULL
ON CONFLICT (metal_id, source_id) DO NOTHING;
