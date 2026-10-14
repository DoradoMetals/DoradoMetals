-- A poll that did not answer. The first in a run is logged as tick_failed by
-- the source_events trigger, with $2 as its detail; the count is what a
-- recovery reports. $2 is the provider's own message.
UPDATE spots.sources
   SET failed_polls = failed_polls + 1, last_error = $2
 WHERE id = $1
