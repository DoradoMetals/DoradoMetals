-- A poll that did not answer. The first in a run is logged as tick_failed by
-- the source_events trigger; the count is what a recovery reports.
UPDATE spots.sources SET failed_polls = failed_polls + 1 WHERE id = $1
