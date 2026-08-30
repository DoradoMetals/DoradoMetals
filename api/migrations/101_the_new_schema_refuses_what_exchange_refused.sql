-- THREE CHECK CONSTRAINTS THAT PROMOTION WOULD HAVE DROPPED SILENTLY. D63.
--
-- `audit:constraints` reported these three and had nowhere to record a decision
-- about them, which is the phase this migration belongs to. Each one is a
-- guard exchange holds today and the schema replacing it does not, so the day a
-- write stops going to exchange the guard is gone - and the failure mode is not
-- an error, it is a value nothing refuses.
--
-- *** 1 AND 2: A PURITY IS A FRACTION, AND IT IS WHAT A CUSTOMER IS PAID ON. ***
--
-- exchange.scrap carries `CHECK (purity >= 0 AND purity <= 1)` and the same for
-- purity_actual. Their successors - orders.items.purity (what the customer
-- declared) and refiners.items.purity (what the refinery reported after the
-- melt) - have nothing standing in for them: no check, no enum, no foreign key.
--
-- That matters more than the other twenty-six findings because of D47:
-- purity_actual multiplies into content_actual, and content is what the payout
-- is computed from. A purity of 12 is arithmetic nonsense that the old schema
-- refused outright and the new one stores, and the number it produces is a
-- payment. Related to D61, which found the same two columns' PRECISION unfixed
-- at the source - so until this they had neither the range guard nor the width.
--
-- Written as exchange writes it - a bare range test, with no `IS NULL OR`.
-- A CHECK on a NULL evaluates to UNKNOWN, which passes, so an unmeasured purity
-- is admitted by both schemas exactly as before. NULL is what these columns
-- already mean by "not measured" (see 087); this constrains only what is there.
--
-- Measured before writing: 0 rows out of range in orders.items (57 rows),
-- refiners.items (57 rows, 42 of them NULL) or exchange.scrap, and 0 in
-- production - exchange.scrap purity and purity_actual, and exchange.products,
-- whose purity FLOWS into orders.items via 031's coalesce and is itself
-- unconstrained: 95 production products, min 0.9, max 0.9999.
--
-- *** 3: A PICKUP STATUS IS ONE OF FOUR WORDS. ***
--
-- exchange.carrier_pickups allows only pending / scheduled / completed /
-- canceled - one l - and shipping.pickups.status is free text. The allowlist is
-- copied verbatim, including the American spelling, because the two tables are
-- dual-written from one service and a value legal in one must be legal in the
-- other.
--
-- THIS ADDS NO NEW FAILURE MODE. `features/shipping/pickups/service.ts` writes
-- exchange FIRST and unconditionally (that file's header explains why: a pickup
-- is a booked courier and failing the order transaction after FedEx has the
-- label is not a trade worth making), so any value this would refuse is already
-- refused one statement earlier by exchange's own check. What it does is keep
-- that true after exchange stops being written.
--
-- Both tables hold zero rows on dev and zero in production, so nothing is
-- validated retroactively.
--
-- Additive, on the new schemas only. exchange is untouched.

ALTER TABLE orders.items
  ADD CONSTRAINT items_purity_range CHECK (purity >= 0 AND purity <= 1);

ALTER TABLE refiners.items
  ADD CONSTRAINT items_purity_range CHECK (purity >= 0 AND purity <= 1);

ALTER TABLE shipping.pickups
  ADD CONSTRAINT pickups_status_check
  CHECK (status = ANY (ARRAY['pending', 'scheduled', 'completed', 'canceled']));
