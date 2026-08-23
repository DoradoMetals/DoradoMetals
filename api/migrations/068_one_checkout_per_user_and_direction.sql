-- A user has one buy checkout and one sell checkout, not many.
--
-- Jacob, 2026-08-23: "Carts are going to become checkout in the migration" and
-- "I was treating adding something to the cart as a checkout session, yes. I
-- think we can live with the other values being null. They just can't be null
-- when the checkout session is converted to an order."
--
-- So a cart IS a checkout session, started empty and filled in as the customer
-- moves through it. exchange models the two directions as separate tables -
-- carts and sell_carts, each UNIQUE (user_id) - and checkout.checkouts models
-- them as one table with a `direction`, the same way orders.orders does. The
-- constraint has to move with them, or ensureCart's upsert has no arbiter and
-- a user can accumulate carts.
--
-- direction is plain text here rather than an enum, and takes the same values
-- orders.orders uses, so a checkout and the order it becomes agree.
--
-- Additive. exchange is untouched.

CREATE UNIQUE INDEX IF NOT EXISTS checkouts_user_direction_key
  ON checkout.checkouts (user_id, direction);
