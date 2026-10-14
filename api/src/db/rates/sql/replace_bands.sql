-- A metal's bands replaced as one list, in ONE statement. The incoming bands
-- and the metal's current rows are paired by position in min_qty order: a
-- paired row is edited in place, so its id and its change trail survive; a
-- band beyond the old count is added; a row beyond the new count is removed.
-- rates_no_overlap_qty is checked at the end of the statement (migration 270),
-- so a list that moves every boundary at once is judged only as a whole.
-- A new row takes the column's default unit; the list carries no unit.
WITH incoming AS (
  SELECT row_number() OVER (ORDER BY b.min_qty) AS seat, b.*
    FROM jsonb_to_recordset($2::jsonb)
         AS b(min_qty numeric, max_qty numeric, scrap_pct numeric, bullion_pct numeric)
),
held AS (
  SELECT row_number() OVER (ORDER BY r.min_qty, r.id) AS seat, r.id
    FROM rates.rates r
   WHERE r.metal_id = $1
),
edited AS (
  UPDATE rates.rates r
     SET min_qty = i.min_qty,
         max_qty = i.max_qty,
         scrap_pct = i.scrap_pct,
         bullion_pct = i.bullion_pct
    FROM incoming i
    JOIN held c ON c.seat = i.seat
   WHERE r.id = c.id
     AND (r.min_qty, r.max_qty, r.scrap_pct, r.bullion_pct)
         IS DISTINCT FROM (i.min_qty, i.max_qty, i.scrap_pct, i.bullion_pct)
  RETURNING r.id
),
added AS (
  INSERT INTO rates.rates (metal_id, min_qty, max_qty, scrap_pct, bullion_pct)
  SELECT $1, i.min_qty, i.max_qty, i.scrap_pct, i.bullion_pct
    FROM incoming i
   WHERE i.seat > (SELECT count(*) FROM held)
  RETURNING id
),
removed AS (
  DELETE FROM rates.rates r
   USING held c
   WHERE r.id = c.id
     AND c.seat > (SELECT count(*) FROM incoming)
  RETURNING r.id
)
SELECT (SELECT count(*) FROM edited)::int AS edited,
       (SELECT count(*) FROM added)::int AS added,
       (SELECT count(*) FROM removed)::int AS removed
