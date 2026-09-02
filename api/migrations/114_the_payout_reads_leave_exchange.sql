-- The last-four projections stop reading exchange.payouts.
--
-- *** WHAT WAS ACTUALLY BROKEN. *** D210 seals a new payout account into
-- payments.details and puts its fee on orders.transactions.payout_fee; D212
-- stopped exchange.payouts receiving writes at all. The composed order read
-- never followed: features/orders/read.service.ts resolves an order's payout
-- through payouts.getMany, whose statement is `FROM exchange.payouts`. Every
-- order created after the purge therefore composes with EMPTY_PAYOUT - no
-- method, no holder, no last-4 - and prices with the payout fee silently
-- dropped to 0, because pricing/bid.ts reads a null cost as zero by design.
--
-- It was invisible until 2026-09-02 because all 33 of dev's purchase orders
-- predated the switch and still carried a legacy row. The first order minted
-- through the native create path (an e2e seed, number 15769) had none, the
-- finalize-pricing fixture takes the NEWEST qualifying order, and the
-- assertion that caught it is the guard its author wrote for exactly this:
-- "AND THE PAYOUT IS ESTABLISHED RATHER THAN ASSUMED".
--
-- *** WHY A MIGRATION AND NOT ONLY A CODE CHANGE. *** 073 carried the account
-- across - holder, bank, type, email, method - and 072/100 carried the fee and
-- the link. Measured on dev before writing this: 33 of 33 orders linked, zero
-- field mismatches, zero fee mismatches. The reads can leave exchange with
-- nothing lost. But 073 deliberately never touches account_number, so it never
-- derived `last_four` from it either, and there has never been a column for the
-- routing number's last four at all.
--
-- Dev hides both, having no bank numbers whatsoever. PRODUCTION HAS 14 PAYOUTS
-- THAT DO, and the statement being replaced computes `right(account_number, 4)`
-- live. Repointing the read without this backfill would blank the last-4 on
-- every one of them - a silent display regression on the admin payout panel,
-- found by a human noticing a blank field rather than by anything here.
--
-- *** THE LAST FOUR ARE NOT A SECRET, and this adds no exposure. *** They are
-- already what every order payload carries and what the panel already renders;
-- the full numbers keep their single door (GET /payouts/:id/details, admin
-- only) and stay in exactly one place until scripts/encrypt-payout-details.ts
-- is run against production. No plaintext is copied, and none is removed:
-- exchange.payouts is READ ONLY here, as the covenant requires.
--
-- Idempotent, and it NEVER overwrites: both writes are COALESCE-guarded, so a
-- value already present - a seal-time last_four from the D210 path - wins over
-- anything derived here. Re-running after new orders exist cannot stale them.

ALTER TABLE payments.details ADD COLUMN IF NOT EXISTS routing_last_four text;

-- The account's last four, and the routing number's, derived from the only
-- place they have ever lived. A details row reaches its payout two ways: 073
-- gave the backfilled row THE PAYOUT'S OWN id, and the dual-era create path
-- minted separate rows that the order links to through
-- orders.transactions.payout_details_id. Both resolve here, so a database
-- built either way lands the same values.
WITH linked AS (
  SELECT d.id AS details_id,
         p.account_number,
         p.routing_number
    FROM exchange.payouts p
    JOIN payments.details d ON d.id = p.id
   WHERE p.account_number IS NOT NULL OR p.routing_number IS NOT NULL
   UNION
  SELECT t.payout_details_id AS details_id,
         p.account_number,
         p.routing_number
    FROM exchange.payouts p
    JOIN orders.transactions t ON t.order_id = p.order_id
   WHERE t.payout_details_id IS NOT NULL
     AND (p.account_number IS NOT NULL OR p.routing_number IS NOT NULL)
)
UPDATE payments.details d
   SET last_four         = COALESCE(d.last_four, right(l.account_number, 4)),
       routing_last_four = COALESCE(d.routing_last_four, right(l.routing_number, 4)),
       updated_at        = now()
  FROM linked l
 WHERE d.id = l.details_id
   AND (
     (d.last_four IS NULL AND l.account_number IS NOT NULL)
     OR (d.routing_last_four IS NULL AND l.routing_number IS NOT NULL)
   );
