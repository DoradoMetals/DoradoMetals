-- orders.items gives up the four columns that belong on the refiner's line.
--
-- Jacob, on seeing the table: "I'm talking about the columns on orders.items....
-- There's like wayyy to many." He was right, and they were mine - migration 033
-- added six of them to close audit:coverage gaps, when four of the six had a
-- home all along:
--
--   refiner_premium   -> refiners.items.premium
--   purity_actual     -> refiners.items.purity
--   post_melt_actual  -> refiners.items.post_melt
--   content_actual    -> refiners.items.content
--
-- That is what refiners.items.order_item_id is for. 064 made the table hold
-- what the refiner reported rather than a copy of what the customer declared,
-- and one row per purchase-order line, so the join is one-to-one.
--
-- The wire shape does not change. purchase-orders/repo.next.js projects all
-- four back off the joined refiner line, and validate:wire checks the result
-- against PurchaseOrderWire for both implementations.
--
-- Two of the six stay:
--
--   price, because it cannot be re-derived. Of 82 priced purchase lines in
--   production, 62 reproduce from content x bid_spot x premium and 20 do not,
--   and all 20 are scrap: exchange.scrap.content is numeric(20,3) at source, so
--   the precision was lost in exchange years ago and price is the only
--   surviving record of it.
--
--   bid_premium, because dropping it would change what the API returns.
--   It is 0.75 on 17 of 20 populated rows - the hardcoded default in
--   features/scrap/repo.js - and on all four rows where it disagrees with
--   premium, so it looks vestigial. But the app maintains it on its own write
--   path, and collapsing it into premium changes four returned values. That is
--   a product decision, not a schema one. See FOLLOWUPS.
--
-- orders.items goes from 19 columns to 15.
--
-- Destructive to the new schema only, and reversible: every value is still in
-- exchange (purchase_order_items.refiner_premium and scrap.*_actual) and in
-- refiners.items. exchange is untouched.

-- One refiner line per order item. The mirror upserts on this, and 064's
-- derivation assumes it; without it the ON CONFLICT has no arbiter and throws.
CREATE UNIQUE INDEX IF NOT EXISTS refiners_items_order_item_id_key
  ON refiners.items (order_item_id);

ALTER TABLE orders.items
  DROP COLUMN IF EXISTS refiner_premium,
  DROP COLUMN IF EXISTS purity_actual,
  DROP COLUMN IF EXISTS post_melt_actual,
  DROP COLUMN IF EXISTS content_actual;
