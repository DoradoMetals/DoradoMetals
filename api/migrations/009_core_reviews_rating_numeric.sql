-- Make core.reviews.rating numeric, matching exchange.
--
-- The new schema declared it `text` where exchange has `numeric`. That is a
-- regression in two ways. It changes the wire shape - a review would arrive as
-- rating "5" instead of 5, which the frontend does not expect - and it makes
-- the column useless for the things a rating is for: you cannot average, sort
-- or range-filter text without casting at every call site.
--
-- The stored values are already numeric-looking (1, 3, 4, 5), so the cast is
-- lossless. It is checked rather than assumed: the USING clause would fail the
-- migration on any row that is not a valid number, and the whole thing runs in
-- a transaction, so a bad row leaves the table untouched.

ALTER TABLE core.reviews
  ALTER COLUMN rating TYPE numeric USING rating::numeric;
