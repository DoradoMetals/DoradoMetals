SELECT s.id, s.stale_after_seconds, s.tick_seconds
  FROM spots.settings s
 WHERE s.id = true
