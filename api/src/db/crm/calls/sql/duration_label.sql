-- A call's LENGTH as the line a screen draws - `4m 12s`, `38s` - or its status
-- when it never connected, which is the same slot the design fills with
-- `no answer`. Formatted here rather than in a browser (ruling 71), and shared
-- by the customer timeline and the inbox so the two cannot disagree.
--
-- No table alias assumed, so this substitutes into any statement whose single
-- relation is crm.calls.
CASE
  WHEN duration_seconds IS NULL OR duration_seconds = 0 THEN status::text
  WHEN duration_seconds < 60 THEN duration_seconds::text || 's'
  ELSE (duration_seconds / 60)::text || 'm '
       || lpad((duration_seconds % 60)::text, 2, '0') || 's'
END
