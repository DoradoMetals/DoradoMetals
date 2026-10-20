-- A LOT'S PREMIUM MAY BE SET BY HAND (ruling 158).
--
-- An admin may override a lot's premium when an order is created in the
-- Create Order drawer; absent, pricing sets it from the rates. A purchase
-- re-tiers its premiums whenever a lot is added or the order is placed, and
-- re-tiering would overwrite the override. `premium_override` records that the
-- premium was chosen by a person, so `order_pricing.sql` leaves it alone.
--
-- Additive: one column with a default. No row is rewritten beyond the default.
-- `exchange` is neither read nor written.

ALTER TABLE inventory.lots
  ADD COLUMN IF NOT EXISTS premium_override boolean DEFAULT false NOT NULL;
