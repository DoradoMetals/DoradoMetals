-- WHO SIGNS FOR THE PARCEL, and where that fact lives.
--
-- CLAUDE.md recorded this as the one blocker under places: `exchange.addresses`
-- has a `name` column, `places.addresses` has none, and `places.user_addresses`
-- has `label` - "a book nickname (Home), not a recipient". So repointing the
-- order composer at places would silently blank every recipient_name.
--
-- TWO THINGS TURNED OUT TO BE TRUE, both measured on dev 2026-09-04:
--
--   1. THE ORDER COMPOSER IS GONE. The orders lane replaced compose.ts /
--      read.service.ts with `domain/orders/read.ts` + `OrderView`, and the FedEx
--      contact is now `order.user.name` - the account's own name. Nothing in
--      api/ reads a recipient_name today. So this is no longer a regression
--      waiting to happen; it is a missing column with no consumer, which is why
--      it can be added calmly.
--
--   2. THE VALUE WAS NEVER LOST. 050's backfill maps `exchange.addresses.name`
--      -> `places.user_addresses.label`, and all 23 dev rows match their
--      exchange source exactly, same user, 23 distinct values - and every real
--      one is a PERSON ("Barry Adler", "Scott Lohman"), not a nickname. `label`
--      has been holding recipient names under the wrong name all along, while
--      the form asked for it with the placeholder "Home".
--
-- THE DECISION: recipient_name belongs on places.user_addresses, beside
-- `label`, NOT on places.addresses.
--
--   * places.addresses is deliberately ownerless and SHARED - user_addresses
--     exists precisely so two people can point at one postal row, and
--     addresses.remove only deletes the row when nothing points at it. A
--     recipient on the shared row means one person's edit renames the other
--     person's parcel.
--   * places.addresses is also what snapshot.sql FREEZES onto an order. A
--     recipient there would be frozen by whoever wrote last, not by whoever
--     placed the order.
--   * exchange.addresses - the source of the value - carries user_id, so an
--     exchange address row IS a per-person row. Its native successor is
--     user_addresses, one link per (user, address). The backfill below is
--     therefore exact rather than a guess.
--
-- NUMBERED 126, NOT 123. The cleanup lane applied 123/124/125 to the shared
-- dev database while this one was being written, so the first spelling of this
-- file collided with its `123_addresses_are_theirs.sql`. Re-applying under the
-- new name is safe and is what happened: ADD COLUMN IF NOT EXISTS, and a fill
-- scoped to `recipient_name IS NULL`.
--
-- Additive: one nullable column and one fill. Nothing is dropped, nothing in
-- `exchange` is written, `label` keeps every value it holds. `(user_id,
-- address_id)` is untouched, so the composite FK the cleanup lane is adding
-- still resolves.

ALTER TABLE places.user_addresses
  ADD COLUMN IF NOT EXISTS recipient_name text;

-- FROM EXCHANGE, WHICH IS THE SOURCE. Read-only against it, keyed on the pair
-- that makes an exchange address row the same thing as a link row.
UPDATE places.user_addresses ua
   SET recipient_name = e.name
  FROM exchange.addresses e
 WHERE e.id = ua.address_id
   AND e.user_id = ua.user_id
   AND e.name IS NOT NULL
   AND ua.recipient_name IS NULL;

-- Rows exchange never had - everything created since the pivot, and every test
-- fixture. `label` is what those rows were given as a name, so it is the only
-- answer available and it is the right one.
UPDATE places.user_addresses
   SET recipient_name = label
 WHERE recipient_name IS NULL
   AND label IS NOT NULL;
