-- Empty a session. The cart sync REPLACES rather than merges, so this runs
-- before every write of a fresh basket.
DELETE FROM checkout.items WHERE checkout_id = $1
