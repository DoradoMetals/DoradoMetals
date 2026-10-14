-- A metal with no override follows the default source. The adjustment_history
-- trigger logs the switch with no new value.
DELETE FROM spots.active_sources WHERE metal_id = $1
