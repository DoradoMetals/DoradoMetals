-- Bring products.bullion's updated_at back in line with exchange.products.
--
-- Every other column already matched across all 62 products; three rows had
-- drifted on updated_at alone, from edits made to exchange after the January
-- copy. Small, but updated_at is what an admin list sorts and what a cache
-- keys on, so a stale one is not harmless.
--
-- Copied server-side, so the microseconds survive - a JS round trip would
-- truncate them to milliseconds, which is the bug migration 015 had to undo.
--
-- exchange is untouched.

UPDATE products.bullion b
SET updated_at = e.updated_at
FROM exchange.products e
WHERE b.id = e.id AND b.updated_at IS DISTINCT FROM e.updated_at;
