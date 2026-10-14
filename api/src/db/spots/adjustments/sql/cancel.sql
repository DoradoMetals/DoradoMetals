-- Cancelling a metal's adjustment deletes the rows in force on it: every
-- freeze, and the adjust row on the metal's own source. A dormant row on
-- another source is not the one the metal page shows and is left alone.
DELETE FROM spots.adjustments a
 USING spots.resolved r
 WHERE r.metal_id = a.metal_id
   AND a.metal_id = $1
   AND (a.mode = 'freeze' OR a.source_id = r.source_id)
RETURNING a.metal_id
